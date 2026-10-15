import { Stack } from "expo-router";
import { useEffect } from "react";

import { announceMounted } from "../src/ui/document";

export default function RootLayout() {
  useEffect(announceMounted, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}
