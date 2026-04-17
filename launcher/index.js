#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const { exec } = require('child_process');

const isPkg = typeof process.pkg !== 'undefined';
const baseDir = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..', 'dist');

const children = [];

function log(msg) {
  process.stdout.write('[Launcher] ' + msg + '\n');
}

function startProcess(name, exe, cwd) {
  log('Starting ' + name + '...');
  const child = spawn(exe, [], { cwd, stdio: 'inherit', windowsHide: false });
  children.push(child);
  child.on('error', (err) => log(name + ' error: ' + err.message));
  child.on('exit', (code) => log(name + ' stopped (code ' + code + ')'));
  return child;
}

// Poll TCP port until it accepts connections
function waitForPort(port, retries, delay) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.connect(port, '127.0.0.1', () => {
        sock.destroy();
        resolve();
      });
      sock.on('error', retry);
      sock.on('timeout', retry);
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) {
        reject(new Error('Port ' + port + ' not available after ' + retries + ' attempts'));
      } else {
        setTimeout(check, delay);
      }
    };
    check();
  });
}

function cleanup() {
  log('Shutting down...');
  children.forEach((c) => { try { c.kill('SIGTERM'); } catch (e) {} });
}

process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

async function main() {
  log('=== Object Detection App ===');
  log('Base directory: ' + baseDir);

  // 1. Start Python YOLO backend (port 8000)
  const pyExe = path.join(baseDir, 'python-backend', 'python-backend.exe');
  startProcess('Python (YOLO)', pyExe, path.join(baseDir, 'python-backend'));

  // 2. Start NestJS backend (port 3001)
  const nestExe = path.join(baseDir, 'nest-backend.exe');
  startProcess('NestJS', nestExe, baseDir);

  // 3. Wait for NestJS to be ready
  log('Waiting for server on port 3001...');
  try {
    await waitForPort(3001, 60, 1000);
    log('Server ready!');
  } catch (e) {
    log('Warning: ' + e.message + '. Opening browser anyway...');
  }

  // 4. Open browser
  exec('start http://localhost:3001');
  log('Browser opened at http://localhost:3001');
  log('Close this window to stop all services.');
}

main().catch((err) => {
  log('Fatal: ' + err.message);
  process.exit(1);
});
