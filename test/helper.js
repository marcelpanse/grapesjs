import _ from 'underscore';
import expect from 'expect';
import sinon from 'sinon';
import { JSDOM } from 'jsdom';
import { XMLSerializer } from 'xmldom';

const innerHTML = '<head></head><body></body>';
const dom = new JSDOM(`<html>${innerHTML}</html>`);
const window = dom.window;

global.dom = dom;
global.resetDom = () => {
  dom.window.document.documentElement.innerHTML = innerHTML;
};

// Fix for the require of jquery
var Module = require('module');
var originalRequire = Module.prototype.require;
Module.prototype.require = function(name) {
  if (name == 'jquery') {
    return originalRequire.call(this, 'cash-dom');
  }
  return originalRequire.apply(this, arguments);
};

var localStorage = {
  getItem(key) {
    return this[key];
  },
  setItem(key, value) {
    this[key] = value;
  },
  removeItem(key, value) {
    delete this[key];
  }
};

global.window = window;
global.document = window.document;
global.FormData = window.FormData;
global._ = _;
global.expect = expect;
global.sinon = sinon;
global.grapesjs = require('./../src');
global.Backbone = require('backbone');
global.localStorage = localStorage;
global.SVGElement = global.Element;
window.$ = Backbone.$;
global.navigator = { userAgent: 'node.js' };

Object.keys(window).forEach(key => {
  if (!(key in global)) {
    global[key] = window[key];
  }
});

// polyfill XMLSerializer
// see also https://github.com/jsdom/jsdom/issues/1368
global.XMLSerializer = XMLSerializer;
