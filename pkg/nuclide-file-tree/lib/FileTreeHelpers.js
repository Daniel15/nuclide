'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import {Directory as LocalDirectory} from 'atom';
import {File as LocalFile} from 'atom';
import {
  RemoteConnection,
  RemoteDirectory,
  RemoteFile,
} from '../../nuclide-remote-connection';
import RemoteUri from '../../nuclide-remote-uri';

import pathModule from 'path';
import url from 'url';
import crypto from 'crypto';

type Directory = LocalDirectory | RemoteDirectory;
type File = LocalFile | RemoteFile;
type Entry = LocalDirectory | RemoteDirectory | LocalFile | RemoteFile;

/*
 * Returns a string with backslashes replaced by two backslashes for use with strings passed to the
 * `RegExp` constructor.
 */
function escapeBackslash(str: string): string {
  return str.replace('\\', '\\\\');
}

function dirPathToKey(path: string): string {
  return path.replace(new RegExp(`${escapeBackslash(pathModule.sep)}+$`), '') + pathModule.sep;
}

function isDirKey(key: string): boolean {
  return (key.slice(-1) === pathModule.sep);
}

function keyToName(key: string): string {
  const path = keyToPath(key);
  const index = path.lastIndexOf(pathModule.sep);
  return (index === -1) ? path : path.slice(index + 1);
}

function keyToPath(key: string): string {
  return key.replace(new RegExp(`${escapeBackslash(pathModule.sep)}+$`), '');
}

function getParentKey(key: string): string {
  const path = keyToPath(key);
  const parsed = RemoteUri.parse(path);
  parsed.pathname = pathModule.join(parsed.pathname, '..');
  const parentPath = url.format((parsed: any));
  return dirPathToKey(parentPath);
}

// The array this resolves to contains the `nodeKey` of each child
function fetchChildren(nodeKey: string): Promise<Array<string>> {
  const directory = getDirectoryByKey(nodeKey);

  return new Promise((resolve, reject) => {
    if (directory == null) {
      reject(`Directory "${nodeKey}" not found or is inaccessible.`);
      return;
    }

    // $FlowIssue https://github.com/facebook/flow/issues/582
    directory.getEntries((error, entries) => {
      // Resolve to an empty array if the directory deson't exist.
      // TODO: should we reject promise?
      if (error && error.code !== 'ENOENT') {
        reject(error);
        return;
      }
      entries = entries || [];
      const keys = entries.map(entry => {
        const path = entry.getPath();
        return entry.isDirectory() ? dirPathToKey(path) : path;
      });
      resolve(keys);
    });
  });
}

function getDirectoryByKey(key: string): ?Directory {
  const path = keyToPath(key);
  if (!isDirKey(key)) {
    return null;
  } else if (RemoteUri.isRemote(path)) {
    const connection = RemoteConnection.getForUri(path);
    if (connection == null) {
      return null;
    }
    return new RemoteDirectory(connection, path);
  } else {
    return new LocalDirectory(path);
  }
}

function getFileByKey(key: string): ?File {
  const path = keyToPath(key);
  if (isDirKey(key)) {
    return null;
  } else if (RemoteUri.isRemote(path)) {
    const connection = RemoteConnection.getForUri(path);
    if (connection == null) {
      return;
    }

    return new RemoteFile(connection, path);
  } else {
    return new LocalFile(path);
  }
}

function getEntryByKey(key: string): ?Entry {
  return getFileByKey(key) || getDirectoryByKey(key);
}

function getDisplayTitle(key: string): ?string {
  const path = keyToPath(key);

  if (RemoteUri.isRemote(path)) {
    const connection = RemoteConnection.getForUri(path);

    if (connection != null) {
      return connection.getDisplayTitle();
    }
  }
}

// Sometimes remote directories are instantiated as local directories but with invalid paths.
function isValidDirectory(directory: Directory): boolean {
  return (
    !isLocalEntry((directory: any)) ||
    isFullyQualifiedLocalPath(directory.getPath())
  );
}

function isLocalEntry(entry: Entry): boolean {
  // TODO: implement `RemoteDirectory.isRemoteDirectory()`
  return !('getLocalPath' in entry);
}

function isFullyQualifiedLocalPath(path: string): boolean {
  return path.charAt(0) === pathModule.sep;
}

function isContextClick(event: SyntheticMouseEvent): boolean {
  return (
    event.button === 2 ||
    (event.button === 0 && event.ctrlKey === true && process.platform === 'darwin')
  );
}

function buildHashKey(nodeKey: string): string {
  return crypto.createHash('MD5').update(nodeKey).digest('base64');
}

module.exports = {
  dirPathToKey,
  isDirKey,
  keyToName,
  keyToPath,
  getParentKey,
  fetchChildren,
  getDirectoryByKey,
  getEntryByKey,
  getFileByKey,
  getDisplayTitle,
  isValidDirectory,
  isLocalEntry,
  isFullyQualifiedLocalPath,
  isContextClick,
  buildHashKey,
};
