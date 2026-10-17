// Config Metro par défaut d'Expo, plus un seul ajout réservé au web :
// react-native-maps n'a pas de version web, l'export web (npm run verify)
// le remplace par un bouchon. iOS et Android ne sont pas concernés.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const mapsWebStub = path.resolve(__dirname, 'scripts/verify/web-stubs/react-native-maps.js');
const upstreamResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { type: 'sourceFile', filePath: mapsWebStub };
  }
  return upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
