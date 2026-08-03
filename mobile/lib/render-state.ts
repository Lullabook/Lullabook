/** First-load skeletons are allowed only before a screen has painted content. */
export function shouldShowInitialSkeleton(loading: boolean, hasPaintedContent: boolean) {
  return loading && !hasPaintedContent;
}
