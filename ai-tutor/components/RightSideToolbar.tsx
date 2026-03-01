"use client";

import { DefaultToolbar } from "tldraw";

export default function RightSideToolbar() {
  return (
    <DefaultToolbar
      orientation="vertical"
      minItems={6}
      minSizePx={340}
      maxItems={9}
      maxSizePx={640}
    />
  );
}
