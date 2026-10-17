/**
 * Bouchon web de react-native-maps, utilisé seulement par l'export web
 * (npm run verify). react-native-maps n'a pas de version web : sans ce
 * bouchon, le bundle web plante au chargement (codegenNativeComponent).
 * Mobile (iOS / Android) : jamais résolu, metro.config.js ne l'applique
 * qu'à la plateforme web.
 */
const React = require('react');
const { View } = require('react-native');

const MapView = React.forwardRef(function MapView(props, ref) {
  React.useImperativeHandle(ref, () => ({
    animateToRegion() {},
    fitToCoordinates() {},
    setCamera() {},
    animateCamera() {},
  }));
  return React.createElement(View, { style: props.style }, props.children);
});

function Marker() {
  return null;
}

module.exports = MapView;
module.exports.default = MapView;
module.exports.Marker = Marker;
module.exports.__esModule = true;
