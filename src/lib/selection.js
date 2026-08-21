function uniqueKnown(ids, orderedIds) {
  const allowed = new Set(orderedIds || []);
  return new Set([...(ids || [])].filter(id => allowed.has(id)));
}

export function reconcileSelection(ids, orderedIds) {
  return uniqueKnown(ids, orderedIds);
}

export function selectIds({ currentIds, orderedIds, targetId, anchorId, toggle = false, range = false }) {
  const ordered = [...new Set(orderedIds || [])];
  if (!ordered.includes(targetId)) {
    return { ids: uniqueKnown(currentIds, ordered), anchorId: anchorId || null };
  }

  const current = uniqueKnown(currentIds, ordered);
  if (range && anchorId && ordered.includes(anchorId)) {
    const start = ordered.indexOf(anchorId);
    const end = ordered.indexOf(targetId);
    return {
      ids: new Set(ordered.slice(Math.min(start, end), Math.max(start, end) + 1)),
      anchorId
    };
  }

  if (toggle) {
    if (current.has(targetId)) current.delete(targetId);
    else current.add(targetId);
    return { ids: current, anchorId: targetId };
  }

  return { ids: new Set([targetId]), anchorId: targetId };
}
