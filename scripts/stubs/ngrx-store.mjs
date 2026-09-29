// 最小桩：只实现测试所需的 createActionGroup / createReducer / on
export const emptyProps = () => ({})
export const props = () => ({})

// 复刻 NgRx 的属性命名：'Load Dataset' -> loadDataset，'Enter Field Review' -> enterFieldReview
function ngrxCamel(key) {
  const words = key.split(/\s+/).filter(Boolean)
  if (!words.length) return key
  return words[0].charAt(0).toLowerCase() + words[0].slice(1) + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

function eventType(source, key) {
  return `[${source}] ${key}`
}

export function createActionGroup({ source, events }) {
  const group = {}
  for (const key of Object.keys(events)) {
    const type = eventType(source, key)
    const actionCreator = (p) => ({ type, ...(p || {}) })
    Object.defineProperty(actionCreator, 'type', { value: type, enumerable: true })
    group[ngrxCamel(key)] = actionCreator
  }
  return group
}

export function on(...args) {
  const reducer = args[args.length - 1]
  const creators = args.slice(0, -1)
  return { types: creators.map((c) => c.type), reducer }
}

export function createReducer(initial, ...ons) {
  return (state = initial, action) => {
    const match = ons.find((entry) => entry.types.includes(action.type))
    return match ? match.reducer(state, action) : state
  }
}
