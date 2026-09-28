// A template remounts on every navigation (a layout does not), so its
// ViewTransition sees the old page exit and the new one enter. The effect is
// a quick fade out and a gentle rise in; the header is anchored in CSS.
// Browsers without View Transitions simply swap the page, as before.

import { ViewTransition } from "react";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
