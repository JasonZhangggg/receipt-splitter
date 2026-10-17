const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const stub = path.join(__dirname, "scripts", "metro-stub.js");

const unused = [
  /node_modules[\\/]expo-router[\\/]build[\\/]views[\\/]Sitemap\.js$/,
  /node_modules[\\/]react-native-web[\\/]dist[\\/]exports[\\/](FlatList|SectionList|VirtualizedList|CheckBox|Switch)[\\/]index\.js$/,
];

const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolved = (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
  if (resolved.type === "sourceFile" && unused.some((pattern) => pattern.test(resolved.filePath))) {
    return { type: "sourceFile", filePath: stub };
  }
  return resolved;
};

module.exports = config;
