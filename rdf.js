// $Id: rdf.js 257 2007-08-14 15:50:32Z brharp $

// In which we define functions for parsing and querying RDF.

var RDF = {
  revision: '$Revision: 257 $',
  
  varp: function (x) {
    return typeof x == 'string' && x.charAt(0) == '?';
  },
    
  atomp: function (x) {
    return typeof x == 'number';
  },

  subject: function (triple) {
    return triple.s;
  },

  predicate: function (triple) {
    return triple.p;
  },

  object: function (triple) {
    return triple.o;
  },

  graph: function (triple) {
    return triple.g;
  },

  id: function (triple) {
    return triple.i;
  },

  unify: function (a, b, e) {
    if (RDF.varp(a) && RDF.varp(b)) {
      return e[a] == e[b];
    }
    else if (RDF.varp(a)) {
      if (e[a]) {
        return e[a] == b;
      } else {
        e[a] = b;
        return true;
      }
    }
    else if (RDF.varp(b)) {
      if (e[b]) {
        return e[b] == a;
      } else {
        e[b] = a;
        return true;
      }
    }
    else if (RDF.atomp(a) && RDF.atomp(b)) {
      return a == b;
    }
    else {
      return RDF.unify(RDF.subject(a), RDF.subject(b), e) 
      &&     RDF.unify(RDF.predicate(a), RDF.predicate(b), e) 
      &&     RDF.unify(RDF.object(a), RDF.object(b), e)
      &&     (a.g ? RDF.unify(RDF.graph(a), RDF.graph(b), e) : true);
    }
  },

  select: function (variables,where) {
    var results = [];
    var g = new RDF.Goal();
    g.call = function (e) {
      var row = {};
      for (var v = 0; v <  variables.length; v++) {
        row[variables[v].substring(1)] = RDF.lookup(e[variables[v]]);
      }
      results.push(row);
    }
    for (var p = where.length-1; p >= 0; p--) {
      var f = new RDF.Goal(RDF.parsePattern(where[p]));
      f.next = g;
      g = f;
    }
    g.call({});
    return results;
  },

  parsePattern: function(pat) {
    if (pat['s'] && !RDF.varp(pat['s'])) pat.s = RDF.intern(pat.s);
    if (pat['p'] && !RDF.varp(pat['p'])) pat.p = RDF.intern(pat.p);
    if (pat['o'] && !RDF.varp(pat['o'])) pat.o = RDF.intern(pat.o);
    if (pat['g'] && !RDF.varp(pat['g'])) pat.g = RDF.intern(pat.g);
    return pat;
  },

  deleteTriples: function (where) {
    var c = RDF.getTriples(RDF.parsePattern(where));
    var d = new Array();
    while (c.hasNext()) {
      d.push(c.nextId());
    }
    d.sort(function(x,y){return x > y ? -1 : x < y ? 1 : 0});
    d.each(RDF.remove);
    RDF.reindexAll();
  },

  remove: function (id) {
    RDF.db.splice(id, 1);
  },
    
  insert: function (s, p, o, g) {
    var triple = {s: s, p: p, o: o, g: g};
    RDF.unindexedTriples.push(triple);
  },

  reindexAll: function () {
    RDF.spogi.clear();
    RDF.posgi.clear();
    RDF.gspoi.clear();
    RDF.gposi.clear();
    RDF.unindexedTriples = RDF.unindexedTriples.concat(RDF.db);
    RDF.db.clear();
    RDF.index();
  },
  
  index: function () {
    if (RDF.unindexedTriples.length == 0)
      return false;
    for (var i = 0; i < RDF.unindexedTriples.length; i++) {
      var t = RDF.unindexedTriples[i];
      var idx = RDF.db.length;
      RDF.spogi.push([t.s, t.p, t.o, t.g, idx]);
      RDF.posgi.push([t.p, t.o, t.s, t.g, idx]);
      RDF.gspoi.push([t.g, t.s, t.p, t.o, idx]);
      RDF.gposi.push([t.g, t.p, t.o, t.s, idx]);
      RDF.db.push(t);
    }
    RDF.unindexedTriples.clear();
    RDF.spogi.sort(RDF.keycmp);
    RDF.posgi.sort(RDF.keycmp);
    RDF.gspoi.sort(RDF.keycmp);
    RDF.gposi.sort(RDF.keycmp);
    return true;
  },

  anonId: 100,

  anonymousNode: function () {
    return '_'+RDF.anonId++;
  },

  parseXML: function (doc, graph) {
    var root = doc.documentElement;
    var c = root.childNodes;
    for (var i = 0; i < c.length; i++) {
      RDF.parseXMLNode(c[i], graph);
    }
    RDF.index();
  },

  parseXMLNode: function (node, graph) {
    // Text
    if (node.nodeType == 3) { 
      return node.nodeValue;
    }
    // Element
    else if (node.nodeType == 1) { 
      var about = node.getAttribute('rdf:about') || 
                  node.getAttribute('about') ||
                  RDF.anonymousNode();
      var type  = node.getAttribute('rdf:type') ||
                  node.getAttribute('type') ||
                  node.nodeName;
      RDF.insert(RDF.intern(about), RDF.intern('rdf:type'),
                 RDF.intern(type), RDF.intern(graph));
      var c = node.childNodes;
      for (var i = 0; i < c.length; i++) {
        RDF.parseXMLProperty(c[i], about, graph);
      }
      return about;
    }
  },

  parseXMLProperty: function (propNode, subject, graph) {
    if (propNode.nodeType == 1) {
      var p = propNode.nodeName;
      var c = propNode.childNodes;
      if (propNode.getAttribute('rdf:parseType') == 'Resource' ||
          propNode.getAttribute('parseType') == 'Resource') {
        var anode = RDF.anonymousNode();
        RDF.insert(RDF.intern(subject), RDF.intern(p),
                   RDF.intern(anode), RDF.intern(graph));
        for (var i = 0; i < c.length; i++) {
          RDF.parseXMLProperty(c[i], anode, graph);
        }
      } else {
        for (var i = 0; i < c.length; i++) {
          var o = RDF.parseXMLNode(c[i], graph);
          if (o.match(/\S/)) { // Skip whitespace.
            RDF.insert(RDF.intern(subject), RDF.intern(p),
                       RDF.intern(o), RDF.intern(graph));
          }
        }
      }
    }
  },

  runquery: function (q) {
    var t0 = new Date().getTime();
    RDF.log("Running Query...");
    var results = RDF.select(q.select, q.where);
    if (q.filter) results = results.findAll(q.filter);
    if (q.order) results.sort(q.order);
    var t1 = new Date().getTime();
    RDF.log("Running Query...Done ("+(t1-t0)/1000+"s)");
    return results;
  },

  lookup: function(id) {
    return RDF.catalog[id];
  },

  intern: function(s) {
    if (typeof s == 'number')
      return alert("Error: Can't intern a number");
    var id = RDF.dict[s];
    if (id != undefined)
      return id;
    id = RDF.catalog.length+1;
    RDF.catalog[id] = s;
    RDF.dict[s] = id;
    return id;
  },

  getTriples: function(a) {
    if (RDF.graph(a)) {
      if (RDF.subject(a))
        return new RDF.Cursor(RDF.gspoi, RDF.mkkey('gspoi', a));
      else
        return new RDF.Cursor(RDF.gposi, RDF.mkkey('gposi', a));
    } else {
      if (RDF.subject(a))
        return new RDF.Cursor(RDF.spogi, RDF.mkkey('spogi', a));
      else
        return new RDF.Cursor(RDF.posgi, RDF.mkkey('posgi', a));
    }
  },

  mkkey: function(keyspec, arg) {
    var key = [];
    for (var i = 0; i < keyspec.length; i++) {
      var p = keyspec.charAt(i);
      if (arg[p])
        key.push(arg[p]);
      else
        break;
    }
    return key;
  },

  /* Compares 2 (potentially partial) keys. Keys are 
     variable length arrays of numbers. Returns -1, 0, or 1
     if key a is less than, equal to, or greater than key b. */
  keycmp: function (a, b) {
    if (a.length > b.length)
      return -RDF.keycmp(b, a);
    for (var i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return +1;
    }
    return 0;
  },

  /* Searches index x for (possibly partial) key k. Returns the
     first (leftmost) matching key. Returns r if the key is not
     found. */
  search: function (x, k, l, u, r) {
    while (l <= u) {
      var i = Math.floor((l + u + 2) / 2) - 1; // Avoid div by zero.
      var c = RDF.keycmp(k, x[i]);
      if (c < 0) 
        u = i - 1;
      else if (c > 0) 
        l = i + 1;
      else if (c == 0)
        return RDF.search(x, k, l, i - 1, i);
    }
    return r;
  },

  log: function(msg) {
    if (RDF.debug) {
      window.status = "RDF: " + msg;
    }
  },

  db: [],
  unindexedTriples: [],
  dict: {},
  catalog: [],
  spogi: [],
  posgi: [],
  gspoi: [],
  gposi: []
}

RDF.Cursor = function(index, key) {
  this.idx = index;
  this.key = key;
  this.pos = 0;
  this.reset();
}

RDF.Cursor.prototype.reset = function() {
  this.pos = RDF.search(this.idx, this.key, 0, this.idx.length-1) || 0;
}

RDF.Cursor.prototype.hasNext = function() {
  return this.pos < this.idx.length && 
    RDF.keycmp(this.key, this.idx[this.pos]) == 0;
}

RDF.Cursor.prototype.nextId = function() {
  return this.idx[this.pos++][4];
}

RDF.Cursor.prototype.next = function() {
  return RDF.db[this.nextId()];
}
  
RDF.Goal = function(pattern) {
  if (pattern) {
    this.pattern = pattern;
    var key = {};
    if (RDF.atomp(pattern['s'])) key['s'] = pattern['s'];
    if (RDF.atomp(pattern['p'])) key['p'] = pattern['p'];
    if (RDF.atomp(pattern['o'])) key['o'] = pattern['o'];
    if (RDF.atomp(pattern['g'])) key['g'] = pattern['g'];
    this.cursor = RDF.getTriples(key);
  }
}

RDF.Goal.prototype.call = function(env) {
  var match = false;
  this.cursor.reset();
  while (this.cursor.hasNext()) {
    var e = Object.extend({}, env);
    if (RDF.unify(this.pattern, this.cursor.next(), e)) {
      match = true;
      this.exit(e);
      if (this.pattern.unique) {
        break;
      }
    }
  }
  if (match == false && this.pattern.optional) {
    this.exit(env);
  }
};

RDF.Goal.prototype.exit = function (e) {
  if (this.next) this.next.call(e);
};


