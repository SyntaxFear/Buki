const { getDefaultConfig } = require("expo/metro-config");

/** @type {import("expo/metro-config").MetroConfig} */
const config = getDefaultConfig(__dirname);

// Expo SQLite's web worker loads its engine as WebAssembly.
config.resolver.assetExts.push("wasm");

// SharedArrayBuffer requires cross-origin isolation during local web testing.
config.server.enhanceMiddleware = (middleware) => {
  return (request, response, next) => {
    response.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    middleware(request, response, next);
  };
};

module.exports = config;
