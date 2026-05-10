export function mapLogEvent(eventName, eventData, tabId) {
  if (!eventData || eventData.tabId !== tabId) {
    return null;
  }

  switch (eventName) {
    case 'log-initial-start':
      return { type: 'initial-start' };
    case 'log-initial-chunk':
      return { type: 'initial-chunk', lines: eventData.lines };
    case 'log-initial-complete':
      return { type: 'initial-complete' };
    case 'log-initial':
      return { type: 'initial', lines: eventData.lines };
    case 'log-lines':
      return { type: 'lines', lines: eventData.lines };
    default:
      return null;
  }
}

export function reduceLogViewerState(state, event) {
  if (!event) {
    return state;
  }

  switch (event.type) {
    case 'lines':
      return {
        ...state,
        lines: [...state.lines, ...(event.lines || [])],
      };
    case 'initial':
      return {
        ...state,
        lines: event.lines || [],
        isLoadingInitial: false,
      };
    case 'initial-start':
      return {
        ...state,
        isLoadingInitial: true,
      };
    case 'initial-chunk':
      return {
        ...state,
        lines: [...state.lines, ...(event.lines || [])],
      };
    case 'initial-complete':
      return {
        ...state,
        isLoadingInitial: false,
      };
    case 'clear':
      return {
        ...state,
        lines: [],
        isLoadingInitial: false,
      };
    default:
      return state;
  }
}
