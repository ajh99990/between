'use strict';
const fs = require('node:fs');
const modules = require('node:module');
const log = process.env.QWEN_TEST_NETWORK_LOG;
if (!log) throw new Error('QWEN_TEST_NETWORK_LOG is required');
function record(event, surface) {
  fs.appendFileSync(log, JSON.stringify({ event, surface, pid: process.pid }) + '\n');
}
function deny(surface) {
  return function () {
    record('blocked', surface);
    const error = new Error('External networking is disabled for this test: ' + surface);
    error.code = 'ERR_TEST_NETWORK_DISABLED';
    throw error;
  };
}
const net = require('node:net');
net.connect = deny('net.connect');
net.createConnection = deny('net.createConnection');
net.Socket.prototype.connect = deny('net.Socket.connect');
net.Server.prototype.listen = deny('net.Server.listen');
const tls = require('node:tls');
tls.connect = deny('tls.connect');
tls.TLSSocket.prototype.connect = deny('tls.TLSSocket.connect');
for (const name of ['http', 'https']) {
  const api = require('node:' + name);
  api.request = deny(name + '.request');
  api.get = deny(name + '.get');
}
require('node:http2').connect = deny('http2.connect');
const dgram = require('node:dgram');
dgram.createSocket = deny('dgram.createSocket');
dgram.Socket.prototype.send = deny('dgram.Socket.send');
dgram.Socket.prototype.bind = deny('dgram.Socket.bind');
const dns = require('node:dns');
for (const object of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const key of Object.getOwnPropertyNames(object)) {
    if ((key.startsWith('resolve') || key === 'lookup' || key === 'lookupService' || key === 'reverse') && typeof object[key] === 'function') {
      object[key] = deny('dns.' + key);
    }
  }
}
function localLookup(hostname, options) {
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) return undefined;
  record('local_stub', 'dns.lookup');
  const family = hostname === '::1' || options?.family === 6 ? 6 : 4;
  const result = { address: family === 6 ? '::1' : '127.0.0.1', family };
  return options?.all ? [result] : result;
}
dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  const result = localLookup(hostname, options);
  if (!result) return deny('dns.lookup')();
  if (Array.isArray(result)) callback(null, result);
  else callback(null, result.address, result.family);
};
dns.promises.lookup = async function (hostname, options) {
  const result = localLookup(hostname, options);
  if (!result) return deny('dns.lookup')();
  return result;
};
globalThis.fetch = deny('fetch');
if ('WebSocket' in globalThis) globalThis.WebSocket = deny('WebSocket');
modules.syncBuiltinESMExports();
record('ready', 'preload');
