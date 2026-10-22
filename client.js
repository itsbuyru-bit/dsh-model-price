// dsh-model-price — client half.
// Registers a composer dock line (session spend + wallet) and a "Model Price"
// settings section. Plain-JS module bundle: no build step, React from the
// platform module table.

window.__ModuleLoader__.load({
  id: 'dsh-model-price',
  factory: function (require) {
    var React = null
    try { React = require('react') } catch (error) { /* fall through */ }
    if (!React) React = globalThis.React
    if (!React) throw new Error('dsh-model-price: React runtime unavailable')
    var ReactDOM = null
    try { ReactDOM = require('react-dom') } catch (error) { ReactDOM = null }

    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useRef = React.useRef
    var useCallback = React.useCallback

    var API = '/api-spend/api/'
    var NS = 'model-price'
    var REPO_URL = 'https://github.com/itsbuyru-bit/dsh-model-price'
    var AUTHOR_NAME = 'Aleksey Zakurdaev'
    var AUTHOR_EMAIL = 'itsnxt@gmail.com'

    /* ------------------------------ copy ------------------------------ */

    /* ---------------------------- locales ----------------------------- */

    var LOCALE_DATA = { dicts: {}, list: [], loaded: false }
    var LAST_CONFIG = null
    var localeWaiters = new Set()
    var localePromise = null

    function subscribeLocales(listener) {
      localeWaiters.add(listener)
      return function () { localeWaiters.delete(listener) }
    }

    function publishLocales(data) {
      LOCALE_DATA = data
      localeWaiters.forEach(function (listener) { listener(data) })
    }

    function loadLocales(force) {
      if (localePromise && !force) return localePromise
      localePromise = call('locales', {}).then(function (value) {
        publishLocales({
          dicts: value && value.dicts ? value.dicts : {},
          list: value && value.locales ? value.locales : [],
          loaded: true,
        })
        return LOCALE_DATA
      }).catch(function () {
        return LOCALE_DATA
      })
      return localePromise
    }

    function useLocaleData() {
      var box = useState(LOCALE_DATA)
      var data = box[0]
      var setData = box[1]
      useEffect(function () {
        var off = subscribeLocales(setData)
        if (!LOCALE_DATA.loaded) loadLocales()
        else setData(LOCALE_DATA)
        return off
      }, [])
      return data
    }

    function resolveLocaleTag(data, language, dshLocale) {
      var dicts = (data && data.dicts) || {}
      var tags = Object.keys(dicts)
      var requested = language && language !== 'auto' ? String(language) : String(dshLocale || 'en')
      var base = requested.split('-')[0].toLowerCase()
      if (dicts[requested]) return requested
      for (var i = 0; i < tags.length; i += 1) {
        if (tags[i].toLowerCase() === requested.toLowerCase()) return tags[i]
      }
      for (var j = 0; j < tags.length; j += 1) {
        if (tags[j].split('-')[0].toLowerCase() === base) return tags[j]
      }
      if (dicts['en-US']) return 'en-US'
      return tags.length > 0 ? tags[0] : 'en-US'
    }

    function translator(language, dshLocale, data) {
      var tag = resolveLocaleTag(data, language, dshLocale)
      var dict = (data && data.dicts && data.dicts[tag]) || {}
      var fallback = (data && data.dicts && data.dicts['en-US']) || {}
      return function (key) {
        if (dict[key] !== undefined) return dict[key]
        if (fallback[key] !== undefined) return fallback[key]
        return key
      }
    }

    function interpolate(text, vars) {
      if (!vars) return text
      return String(text).replace(/\{(\w+)\}/g, function (_, key) {
        return vars[key] === undefined ? '' : String(vars[key])
      })
    }

    /* ---------------------------- transport ---------------------------- */

    async function call(method, payload) {
      var res = await fetch(API + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
      })
      var data = await res.json().catch(function () { return { ok: false, error: 'invalid response' } })
      if (!data.ok) throw new Error(data.error || 'request failed')
      return data.value
    }

    /* ---------------------------- formatting --------------------------- */

    function symbolOf(currency) { return currency === 'CNY' ? '¥' : '$' }

    function money(amount, currency) {
      if (amount === null || amount === undefined || !isFinite(amount)) return '—'
      var abs = Math.abs(amount)
      var digits = abs > 0 && abs < 0.01 ? 4 : 2
      return symbolOf(currency) + amount.toFixed(digits)
    }

    function compact(value) {
      if (!isFinite(value)) return '0'
      if (value >= 1e6) return (value / 1e6).toFixed(value >= 1e7 ? 0 : 1) + 'M'
      if (value >= 1e3) return (value / 1e3).toFixed(value >= 1e4 ? 0 : 1) + 'k'
      return String(Math.round(value))
    }

    function day(iso, localeTag) {
      if (!iso) return '—'
      try {
        return new Date(iso).toLocaleDateString(localeTag || 'en-US')
      } catch (error) {
        return iso.slice(0, 10)
      }
    }

    function parseClock(text, fallback) {
      var match = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim())
      if (!match) return fallback
      var hour = Number(match[1])
      var minute = Number(match[2])
      if (hour > 23 || minute > 59) return fallback
      return hour * 60 + minute
    }

    /** Short weekday names for 1=Mon … 7=Sun, localized by the browser. */
    function weekdayNames(localeTag) {
      var names = []
      for (var index = 0; index < 7; index += 1) {
        // 2024-01-01 is a Monday.
        var date = new Date(Date.UTC(2024, 0, 1 + index))
        try {
          names.push(date.toLocaleDateString(localeTag || 'en-US', { weekday: 'short', timeZone: 'UTC' }))
        } catch (error) {
          names.push(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index])
        }
      }
      return names
    }

    function clockText(date, localeTag) {
      try {
        return date.toLocaleTimeString(localeTag || 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      } catch (error) {
        return String(date.getUTCHours()).padStart(2, '0') + ':' + String(date.getUTCMinutes()).padStart(2, '0')
      }
    }

    function durationText(ms, localeTag) {
      var total = Math.max(1, Math.round(ms / 60000))
      var hours = Math.floor(total / 60)
      var minutes = total % 60
      var parts = []
      try {
        if (hours > 0) {
          parts.push(new Intl.NumberFormat(localeTag || 'en-US', { style: 'unit', unit: 'hour', unitDisplay: 'narrow' }).format(hours))
        }
        if (minutes > 0) {
          parts.push(new Intl.NumberFormat(localeTag || 'en-US', { style: 'unit', unit: 'minute', unitDisplay: 'narrow' }).format(minutes))
        }
      } catch (error) {
        if (hours > 0) parts.push(hours + 'h')
        if (minutes > 0) parts.push(minutes + 'm')
      }
      return parts.join(' ')
    }

    /** Peak schedule: 01:00-04:00 and 06:00-10:00 UTC, Mon-Fri, minus holidays. */
    function peakWindowsOf(config) {
      var text = config && config.peakWindows ? String(config.peakWindows) : '01:00-04:00, 06:00-10:00'
      var windows = []
      text.split(/[,;\n]+/).forEach(function (part) {
        var match = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(part)
        if (!match) return
        var start = parseClock(match[1] + ':' + match[2], -1)
        var end = parseClock(match[3] + ':' + match[4], -1)
        if (start < 0 || end < 0) return
        windows.push({ start: start, end: end })
      })
      if (windows.length === 0) windows = [{ start: 60, end: 240 }, { start: 360, end: 600 }]
      return windows
    }

    function peakDaysOf(config) {
      var days = config && Array.isArray(config.peakDays) ? config.peakDays : [1, 2, 3, 4, 5]
      var normalized = days.map(Number).filter(function (day) { return day >= 1 && day <= 7 })
      return normalized.length > 0 ? normalized : [1, 2, 3, 4, 5]
    }

    function isHoliday(date, config) {
      var list = config && Array.isArray(config.holidays) ? config.holidays : []
      var ymd = date.toISOString().slice(0, 10)
      return list.indexOf(ymd) !== -1
    }

    function isPeakAt(ms, config) {
      var date = new Date(ms)
      if (isHoliday(date, config)) return false
      var isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
      if (peakDaysOf(config).indexOf(isoDay) === -1) return false
      var minute = date.getUTCHours() * 60 + date.getUTCMinutes()
      return peakWindowsOf(config).some(function (window) {
        return window.start <= window.end
          ? minute >= window.start && minute < window.end
          : minute >= window.start || minute < window.end
      })
    }

    /** The current or next Off-Peak block, as absolute Date objects. */
    function cheapWindowInfo(config, nowMs) {
      var step = 60000
      var limit = nowMs + 9 * 86400000
      if (!isPeakAt(nowMs, config)) {
        var endNow = nowMs
        while (endNow < limit && !isPeakAt(endNow, config)) endNow += step
        return { active: true, start: new Date(nowMs), end: new Date(endNow), startsInMs: 0, endsInMs: endNow - nowMs }
      }
      var start = nowMs
      while (start < limit && isPeakAt(start, config)) start += step
      var end = start
      while (end < limit && !isPeakAt(end, config)) end += step
      return { active: false, start: new Date(start), end: new Date(end), startsInMs: start - nowMs, endsInMs: end - nowMs }
    }

    /* ------------------------------ styles ----------------------------- */

    var CSS = [
      '.mp-anchor{position:relative;display:inline-flex;align-items:center;gap:4px;min-width:0}',
      '.mp-line{display:inline-flex;align-items:center;gap:6px;padding:2px 6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;line-height:18px;border-radius:6px;cursor:pointer;white-space:nowrap}',
      '.mp-line:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.mp-line:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.mp-label{opacity:.75}',
      '.mp-value{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
      '.mp-sep{opacity:.45;padding:0 1px}',
      '.mp-badge{display:inline-flex;align-items:center;height:16px;padding:0 6px;border-radius:8px;font-size:10px;font-weight:600;letter-spacing:.2px;background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 18%, transparent);color:var(--dsw-alias-state-warn-primary)}',
      '.mp-badge.off{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent);color:var(--dsw-alias-state-success-primary)}',
      '.mp-live{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary);animation:mp-pulse 1.1s ease-in-out infinite}',
      '@keyframes mp-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}',
      '.mp-eye{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.mp-eye:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.mp-pop{position:absolute;right:0;bottom:calc(100% + 8px);z-index:1100;box-sizing:border-box;width:min(360px,calc(100vw - 24px));max-height:min(70vh,540px);overflow:auto;padding:12px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));backdrop-filter:var(--dsw-menu-backdrop-filter,none);box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.28));color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px;text-align:left;white-space:normal;cursor:default}',
      '.mp-section{margin:14px 0 4px;color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:500;line-height:20px}',
      '.mp-best{margin-bottom:10px;padding-bottom:10px;border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}',
      '.mp-pop .mp-head{display:flex;align-items:center;gap:6px;margin-bottom:0}',
      '.mp-headline{color:var(--dsw-alias-label-tertiary)}',
      '.mp-percent{color:var(--dsw-alias-label-primary);font-weight:500;font-variant-numeric:tabular-nums}',
      '.mp-figures{margin-left:auto;color:var(--dsw-alias-label-primary);font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.mp-bar{display:none}',
      '.mp-seg{background:var(--meter-tint,var(--dsw-alias-label-tertiary));border-radius:1px;flex:none;min-width:2px;height:100%}',
      '.mp-swatch{background:var(--meter-tint);border-radius:2px;width:8px;height:8px;margin-right:6px;display:inline-block;vertical-align:baseline}',
      '.mp-tint-in{--meter-tint:var(--dsw-static-neutral-bluish-400,#94a3b8)}',
      '.mp-tint-out{--meter-tint:#a78bfa}',
      '.mp-tint-hit{--meter-tint:var(--dsw-static-blue-450,#3b82f6)}',
      '.mp-tint-write{--meter-tint:var(--dsw-alias-label-tertiary)}',
      '.mp-legend{margin:10px 0 0}',
      '.mp-legend dt,.mp-legend dd{margin:0}',
      '.mp-legend .l{display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary)}',
      '.mp-legend .v{color:var(--dsw-alias-label-primary)}',
      '.mp-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:2px 0}',
      '.mp-row .l{color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.mp-row .v{font-variant-numeric:tabular-nums}',
      '.mp-big{font-size:16px;font-weight:650;font-variant-numeric:tabular-nums}',
      '.mp-hr{border-top:.5px solid var(--dsw-alias-border-l2);margin:10px 0}',
      '.mp-muted{color:var(--dsw-alias-label-secondary);font-size:11px;opacity:.9}',
      '.mp-table{width:100%;border-collapse:collapse;margin-top:2px}',
      '.mp-table th{font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:var(--dsw-alias-label-secondary);text-align:left;font-weight:600;padding:0 0 4px}',
      '.mp-table th.r,.mp-table td.r{text-align:right;white-space:nowrap}',
      '.mp-table td{padding:5px 0;border-top:1px solid var(--dsw-alias-border-l1);vertical-align:top}',
      '.mp-model{font-weight:600}',
      '.mp-tok{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:normal;overflow-wrap:anywhere;line-height:1.4}',
      '.mp-warn{color:var(--dsw-alias-state-error-primary);font-size:11px;margin-top:4px}',
      '.mp-btn{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;cursor:pointer}',
      '.mp-btn:hover{border-color:var(--dsw-alias-border-l2)}',
      '.mp-btn.pri{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:650}',
      '.mp-btn:disabled{opacity:.55;cursor:default}',
      '.mp-btn.ghost{background:transparent}',
      '.mp-settings{display:flex;flex-direction:column;gap:16px;padding:2px 0 28px;max-width:860px}',
      '.mp-settings h2{margin:0;font-size:16px;font-weight:650;letter-spacing:-.2px}',
      '.mp-settings p.intro{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}',
      '.mp-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-layer-1)}',
      '.mp-card h3{margin:0 0 10px;font-size:12px;font-weight:650;text-transform:uppercase;letter-spacing:.35px;color:var(--dsw-alias-label-secondary)}',
      '.mp-card-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.mp-time-row{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:10px}',
      '.mp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px 14px}',
      '.mp-field{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.mp-field label{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.mp-field .hint{font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.mp-in,.mp-sel{box-sizing:border-box;width:100%;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}',
      '.mp-in:focus,.mp-sel:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}',
      '.mp-model-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-base);display:flex;flex-direction:column;gap:8px}',
      '.mp-model-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer;border-radius:6px;padding:2px 0}',
      '.mp-model-head:hover .mp-model-name{color:var(--dsw-alias-brand-primary)}',
      '.mp-chev{display:inline-flex;align-items:center;justify-content:center;width:14px;color:var(--dsw-alias-label-secondary);transition:transform .15s ease;transform-origin:50% 50%}',
      '.mp-chev.open{transform:rotate(90deg)}',
      '.mp-model-summary{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}',
      '.mp-model-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}',
      '.mp-model-toolbar .spacer{flex:1}',
      '.mp-model-body{display:flex;flex-direction:column;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.mp-model-schedule{display:flex;flex-direction:column;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.mp-model-schedule .hint{font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.mp-source{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:8px}',
      '.mp-source-title{font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.3px}',
      '.mp-source-head{display:flex;align-items:center;gap:6px;cursor:pointer;border-radius:6px;padding:2px 0}',
      '.mp-source-head:hover .mp-source-title{color:var(--dsw-alias-label-primary)}',
      '.mp-source-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:8px}',
      '.mp-source-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.mp-source-host{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-primary)}',
      '.mp-source-line .mp-btn{height:24px;padding:0 8px;font-size:11px}',
      '.mp-check-row{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-primary)}',
      '.mp-model-name{font-weight:650;font-size:12.5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
      '.mp-model-head .spacer{flex:1}',
      '.mp-price-grid{display:grid;grid-template-columns:78px repeat(4,minmax(56px,1fr));gap:6px;align-items:center}',
      '.mp-price-grid .h{font-size:10px;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.3px}',
      '.mp-price-grid .rh{font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
      '.mp-price-grid .mp-in{height:26px;font-size:11.5px}',
      '.mp-tariff{font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.3px;margin-top:2px}',
      '.mp-about{margin-top:2px;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.7}',
      '.mp-about a{color:var(--dsw-alias-label-primary);text-decoration:underline;text-underline-offset:2px}',
      '.mp-about a:hover{color:var(--dsw-alias-brand-primary)}',
      '.mp-update{color:var(--dsw-alias-state-warn-primary);font-weight:600;margin-bottom:4px}',
      '.mp-warn{color:var(--dsw-alias-state-warn-primary);font-size:11.5px;font-weight:600}',
      '.mp-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:20px}',
      '.mp-modal-card{width:min(440px,100%);max-height:86vh;overflow:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;padding:16px 18px 14px;box-shadow:0 18px 50px rgba(0,0,0,.45);color:var(--dsw-alias-label-primary)}',
      '.mp-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
      '.mp-modal-title{margin:0;font-size:16px;font-weight:650;letter-spacing:-.2px}',
      '.mp-modal-x{width:26px;height:26px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:18px;line-height:1;cursor:pointer}',
      '.mp-modal-x:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.mp-modal-text{margin:12px 0 14px;font-size:12.5px;line-height:1.55;color:var(--dsw-alias-label-secondary)}',
      '.mp-modal-rows{display:flex;flex-direction:column;gap:8px;font-size:12px}',
      '.mp-modal-row{display:flex;align-items:baseline;gap:10px}',
      '.mp-modal-row .l{width:132px;flex:none;color:var(--dsw-alias-label-secondary)}',
      '.mp-modal-row .v{font-weight:600;font-variant-numeric:tabular-nums}',
      '.mp-modal-divider{height:1px;background:var(--dsw-alias-border-l1);margin:14px 0}',
      '.mp-modal-section h4{margin:0 0 6px;font-size:13px;font-weight:650}',
      '.mp-modal-section p{margin:0 0 10px;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}',
      '.mp-modal-cmd{display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base)}',
      '.mp-modal-cmd code{flex:1;min-width:0;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}',
      '.mp-modal-note{margin:10px 0 0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}',
      '.mp-modal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}',
      '.mp-about-toggle{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}',
      '.mp-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.mp-ok{color:var(--dsw-alias-state-success-primary);font-size:11.5px}',
      '.mp-err{color:var(--dsw-alias-state-error-primary);font-size:11.5px}',
      '.mp-summary{display:flex;gap:18px;flex-wrap:wrap}',
      '.mp-summary div{display:flex;flex-direction:column;gap:2px}',
      '.mp-summary .v{font-size:15px;font-weight:650;font-variant-numeric:tabular-nums}',
      '.mp-summary .l{font-size:10.5px;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.3px}',
      '.mp-add{display:grid;grid-template-columns:1fr 1.4fr auto;gap:8px;align-items:end}',
    ].join('\n')

    /* ------------------------------ icons ------------------------------ */

    function Svg(props) {
      return h('svg', {
        width: props.size || 13,
        height: props.size || 13,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { flex: 'none' },
        'aria-hidden': true,
      }, props.children)
    }

    function CoinIcon() {
      return h(Svg, null, [
        h('circle', { key: 'c', cx: 12, cy: 12, r: 8.5 }),
        h('path', { key: 'p', d: 'M12 7.5v9M14.6 9.3c-.5-.8-1.5-1.3-2.6-1.3-1.5 0-2.6.8-2.6 2 0 1.3 1.3 1.7 2.6 2 1.3.3 2.6.7 2.6 2 0 1.2-1.1 2-2.6 2-1.1 0-2.1-.5-2.6-1.3' }),
      ])
    }

    function WalletIcon() {
      return h(Svg, { size: 14 }, [
        h('path', { key: 'a', d: 'M3 7.5A2.5 2.5 0 015.5 5H18a2 2 0 012 2v1' }),
        h('rect', { key: 'b', x: 3, y: 7, width: 18, height: 12, rx: 2.5 }),
        h('path', { key: 'c', d: 'M16 13h3' }),
        h('circle', { key: 'd', cx: 16.5, cy: 13, r: 0.9, fill: 'currentColor', stroke: 'none' }),
      ])
    }

    function EyeIcon(props) {
      return h(Svg, null, [
        h('path', { key: 'a', d: props.off ? 'M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7' : 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z' }),
        props.off ? h('path', { key: 'b', d: 'M9.9 5.2A11 11 0 0112 5c6.4 0 10 6 10 6a17 17 0 01-3.2 3.9M6.2 6.7A17 17 0 002 12s3.6 6 10 6c1 0 1.9-.1 2.7-.4' }) : h('circle', { key: 'c', cx: 12, cy: 12, r: 3 }),
      ])
    }

    /* --------------------------- spend line ---------------------------- */

    function WalletRows(props) {
      var wallet = props.wallet
      var t = props.t
      var hidden = props.hideWallet
      if (!wallet || wallet.source === 'none') {
        return h('div', { className: 'mp-muted' }, t('noWallet'))
      }
      var rows = []
      rows.push(h('div', { className: 'mp-row', key: 'bal' }, [
        h('span', { className: 'l', key: 'l' }, t('balance')),
        h('span', { className: 'v', key: 'v' }, hidden ? '••••' : money(wallet.balance, wallet.currency)),
      ]))
      if (wallet.bonus) {
        rows.push(h('div', { className: 'mp-row', key: 'bon' }, [
          h('span', { className: 'l', key: 'l' }, t('bonus')),
          h('span', { className: 'v', key: 'v' }, hidden ? '••••' : money(wallet.bonus, wallet.currency)),
        ]))
      }
      if (wallet.source === 'budget') {
        rows.push(h('div', { className: 'mp-row', key: 'src' }, [
          h('span', { className: 'l', key: 'l' }, t('localBudget')),
          h('span', { className: 'v', key: 'v' }, hidden ? '••••' : money(wallet.budget, wallet.currency)),
        ]))
      } else {
        var raw = (wallet.accounts || []).concat(wallet.bonuses || []).filter(function (w) {
          return Number(w.amount) !== 0
        })
        var foreign = raw.filter(function (w) { return w.currency !== wallet.currency })
        if (foreign.length > 0) {
          rows.push(h('div', { className: 'mp-row', key: 'raw' }, [
            h('span', { className: 'l', key: 'l' }, t('original')),
            h('span', { className: 'v mp-muted', key: 'v' },
              foreign.map(function (w) { return symbolOf(w.currency) + Number(w.amount).toFixed(2) }).join(' · ')),
          ]))
        }
      }
      if (wallet.currency === 'CNY') {
        rows.push(h('div', { className: 'mp-muted', key: 'rate' }, t('rate') + ': ' + interpolate(t('rateLine'), { rate: Number(wallet.rate).toFixed(2) })))
      }
      return h('div', null, rows)
    }

    function ModelTable(props) {
      var t = props.t
      var rows = props.rows
      if (!rows || rows.length === 0) {
        return h('div', { className: 'mp-muted' }, t('unpriced'))
      }
      return h('table', { className: 'mp-table' }, [
        h('thead', { key: 'h' }, h('tr', null, [
          h('th', { key: 'm' }, t('model')),
          h('th', { key: 'c', className: 'r' }, t('cost')),
        ])),
        h('tbody', { key: 'b' }, rows.map(function (row) {
          var tokens = row.input + row.output + row.cacheRead + row.cacheWrite
          var detail = [
            t('input') + ' ' + row.input,
            t('output') + ' ' + row.output,
            t('cacheHit') + ' ' + row.cacheRead,
            row.cacheWrite ? t('cacheWrite') + ' ' + row.cacheWrite : null,
          ].filter(Boolean).join(' · ')
          return h('tr', { key: row.key }, [
            h('td', { key: 'm' }, [
              h('div', { className: 'mp-model', key: 'n' }, row.model || row.key),
              h('div', { className: 'mp-tok', key: 'p' }, (row.provider || '') + ' · ' + compact(tokens) + ' ' + t('tokensShort')),
              h('div', { className: 'mp-tok', key: 'd' }, detail),
            ]),
            h('td', { key: 'c', className: 'r' }, row.priced
              ? money(row.cost, props.currency)
              : h('span', { className: 'mp-warn' }, '?')),
          ])
        })),
      ])
    }

    function Popover(props) {
      var t = props.t
      var state = props.state
      var session = state.session
      var wallet = state.wallet
      var ref = props.panelRef
      var lang = props.lang
      var reset = props.onReset
      var busy = props.busy
      var pos = props.pos
      var style = pos
        ? { position: 'fixed', right: pos.right, bottom: pos.bottom, top: 'auto', left: 'auto' }
        : undefined
      var allRows = session.self.rows.concat(session.children.rows)
      var totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      for (var ri = 0; ri < allRows.length; ri += 1) {
        var item = allRows[ri]
        totals.input += item.input
        totals.output += item.output
        totals.cacheRead += item.cacheRead
        totals.cacheWrite += item.cacheWrite
      }
      var tokenTotal = totals.input + totals.output + totals.cacheRead + totals.cacheWrite
      var segments = [
        { key: 'in', label: t('input'), value: totals.input, tint: 'mp-tint-in' },
        { key: 'out', label: t('output'), value: totals.output, tint: 'mp-tint-out' },
        { key: 'hit', label: t('cacheHit'), value: totals.cacheRead, tint: 'mp-tint-hit' },
        { key: 'write', label: t('cacheWrite'), value: totals.cacheWrite, tint: 'mp-tint-write' },
      ].filter(function (part) { return part.value > 0 })

      var best = state.config.showBestTime === false ? null : cheapWindowInfo(state.config, Date.now())
      var bestText = null
      if (best) {
        bestText = best.active
          ? interpolate(t('bestTimeNow'), { time: clockText(best.end, lang) })
          : interpolate(t('bestTimeIn'), {
            duration: durationText(best.startsInMs, lang),
            start: clockText(best.start, lang),
            end: clockText(best.end, lang),
          })
      }

      return h('div', { className: 'mp-pop', ref: ref, style: style, role: 'dialog', 'aria-label': t('apiSpend') }, [
        best ? h('div', { className: 'mp-best', key: 'best' }, [
          h('div', { className: 'mp-section', key: 'h', style: { marginTop: 0 } }, t('bestTime')),
          h('div', { key: 't' }, bestText),
        ]) : null,
        h('div', { className: 'mp-section', key: 'ws', style: { marginTop: best ? 10 : 0 } }, t('wallet')),
        h(WalletRows, { key: 'wr', wallet: wallet, t: t, hideWallet: props.hideWallet }),
        h('div', { className: 'mp-hr', key: 'hr1' }),
        h('div', { className: 'mp-head', key: 'head' }, [
          h('span', { className: 'mp-headline', key: 'l' }, t('session')),
          h('span', { className: 'mp-percent', key: 'p' }, money(session.total, session.currency)),
          h('span', { className: 'mp-figures', key: 'f' }, '~' + compact(tokenTotal) + ' ' + t('tokensShort')),
          h('span', { className: 'mp-badge' + (state.tariff === 'off' ? ' off' : ''), key: 'b', style: { marginLeft: 6 } },
            state.tariff === 'off' ? t('offPeak') : t('peak')),
          session.running ? h('span', { className: 'mp-live', key: 'live', title: t('live') }) : null,
        ]),
        segments.length > 0 ? h('dl', { className: 'mp-legend', key: 'legend' }, segments.map(function (part) {
          return h('div', { className: 'mp-row', key: part.key }, [
            h('dt', { className: 'l', key: 'l' }, [
              h('span', { className: 'mp-swatch ' + part.tint, key: 'sw', 'aria-hidden': true }),
              part.label,
            ]),
            h('dd', { className: 'v', key: 'v' }, '~' + compact(part.value)),
          ])
        })) : null,
        session.children.count > 0 ? h('div', { className: 'mp-row', key: 'ch', style: { marginTop: 6 } }, [
          h('span', { className: 'l', key: 'l' }, t('children') + ' (' + session.children.count + ')'),
          h('span', { className: 'v', key: 'v' }, money(session.children.total, session.currency)),
        ]) : null,
        h('div', { className: 'mp-section', key: 'ms' }, t('model')),
        h(ModelTable, { key: 'mt', rows: session.self.rows, t: t, currency: session.currency }),
        session.self.missing > 0 ? h('div', { className: 'mp-muted', key: 'miss' }, t('missing') + ': ' + session.self.missing) : null,
        session.unpriced.length > 0 ? h('div', { className: 'mp-warn', key: 'unp' }, t('unpriced') + ': ' + session.unpriced.join(', ')) : null,
        (session.requests && (session.requests.searches + session.requests.fetches) > 0) ? h('div', { key: 'req' }, [
          h('div', { className: 'mp-section', key: 'h' }, t('requestsTitle')),
          h('div', { className: 'mp-row', key: 's' }, [
            h('span', { className: 'l', key: 'l' }, t('search')),
            h('span', { className: 'v', key: 'v' }, String(session.requests.searches)),
          ]),
          h('div', { className: 'mp-row', key: 'f' }, [
            h('span', { className: 'l', key: 'l' }, t('fetch')),
            h('span', { className: 'v', key: 'v' }, String(session.requests.fetches)),
          ]),
          h('div', { className: 'mp-row', key: 'c' }, [
            h('span', { className: 'l', key: 'l' }, t('requestsCost')),
            h('span', { className: 'v', key: 'v' }, money(session.requests.cost, session.currency)),
          ]),
        ]) : null,
        h('div', { className: 'mp-hr', key: 'hr2' }),
        h('div', { className: 'mp-row', key: 'at' }, [
          h('span', { className: 'l', key: 'l' }, t('allTime') + ' (' + t('since') + ' ' + day(state.allTime.since, lang) + ')'),
          h('span', { className: 'v', key: 'v' }, money(state.allTime.total, state.allTime.currency)),
        ]),
        h('div', { className: 'mp-row', key: 'ar' }, [
          h('span', { className: 'mp-muted', key: 'n' }, t('retroactive')),
          h('button', {
            key: 'r', className: 'mp-btn ghost', disabled: busy,
            onClick: reset,
          }, t('reset')),
        ]),
      ])
    }

    function SpendLine(props) {
      var sessionId = props.sessionId
      var dshLocale = typeof props.dshLocale === 'function' ? props.dshLocale() : props.dshLocale
      var stateBox = useState(null)
      var state = stateBox[0]
      var setState = stateBox[1]
      var openBox = useState(false)
      var open = openBox[0]
      var setOpen = openBox[1]
      var busyBox = useState(false)
      var busy = busyBox[0]
      var setBusy = busyBox[1]
      var localHideBox = useState(null)
      var localHide = localHideBox[0]
      var setLocalHide = localHideBox[1]
      var localeData = useLocaleData()
      var rootRef = useRef(null)
      var panelRef = useRef(null)
      var posBox = useState(null)
      var pos = posBox[0]
      var setPos = posBox[1]

      var openPanel = function () {
        if (!open && rootRef.current) {
          var rect = rootRef.current.getBoundingClientRect()
          setPos({
            right: Math.max(8, window.innerWidth - rect.right),
            bottom: Math.max(8, window.innerHeight - rect.top + 8),
          })
        }
        setOpen(!open)
      }

      useEffect(function () {
        var alive = true
        var timer = null
        function tick() {
          call('state', { sessionId: sessionId }).then(function (value) {
            if (!alive) return
            setState(value)
            timer = setTimeout(tick, value && value.session && value.session.running ? 1000 : 2500)
          }).catch(function () {
            if (!alive) return
            timer = setTimeout(tick, 5000)
          })
        }
        tick()
        return function () { alive = false; if (timer) clearTimeout(timer) }
      }, [sessionId])

      useEffect(function () {
        if (!open) return undefined
        function onDown(event) {
          if (panelRef.current && panelRef.current.contains(event.target)) return
          if (rootRef.current && rootRef.current.contains(event.target)) return
          setOpen(false)
        }
        function onKey(event) { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', onDown)
        document.addEventListener('keydown', onKey)
        return function () {
          document.removeEventListener('pointerdown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      if (!state) return null
      var cfg = state.config
      LAST_CONFIG = cfg
      if (cfg.hideLine) return null

      var t = translator(cfg.language, dshLocale, localeData)
      var hidden = localHide === null ? Boolean(cfg.hideWallet) : localHide
      var session = state.session
      var wallet = state.wallet

      var toggleHide = function (event) {
        event.stopPropagation()
        var next = !hidden
        setLocalHide(next)
        call('save', { hideWallet: next }).catch(function () { setLocalHide(null) })
      }

      var doReset = function (event) {
        event.stopPropagation()
        if (!window.confirm(t('resetConfirm'))) return
        setBusy(true)
        call('reset', {}).then(function () { return call('state', { sessionId: sessionId }) })
          .then(function (value) { setState(value) })
          .catch(function () {})
          .then(function () { setBusy(false) })
      }

      var panel = open ? h(Popover, {
        key: 'pop',
        state: state,
        wallet: wallet,
        session: session,
        t: t,
        lang: resolveLocaleTag(localeData, cfg.language, dshLocale),
        hideWallet: hidden,
        panelRef: panelRef,
        onReset: doReset,
        busy: busy,
        pos: pos,
      }) : null

      return h('div', { className: 'mp-anchor', ref: rootRef }, [
        h('button', {
          key: 'line',
          type: 'button',
          className: 'mp-line',
          'aria-expanded': open,
          title: t('apiSpend'),
          onClick: openPanel,
        }, [
          h(CoinIcon, { key: 'i' }),
          h('span', { key: 's', className: 'mp-label' }, t('session') + ':'),
          h('span', { key: 'sv', className: 'mp-value' }, money(session.total, session.currency)),
          h('span', { key: 'd1', className: 'mp-sep' }, '·'),
          h('span', {
            key: 'w',
            className: 'mp-label',
            title: t('wallet'),
            'aria-label': t('wallet'),
            style: { display: 'inline-flex', alignItems: 'center' },
          }, h(WalletIcon)),
          h('span', { key: 'wv', className: 'mp-value' }, hidden ? '••••' : money(wallet.total, wallet.currency)),
          h('span', { key: 'badge', className: 'mp-badge' + (state.tariff === 'off' ? ' off' : '') },
            state.tariff === 'off' ? t('offPeak') : t('peak')),
          session.running ? h('span', { key: 'live', className: 'mp-live', title: t('live') }) : null,
        ]),
        h('button', {
          key: 'eye',
          type: 'button',
          className: 'mp-eye',
          title: hidden ? t('show') : t('hide'),
          'aria-label': hidden ? t('show') : t('hide'),
          onClick: toggleHide,
        }, h(EyeIcon, { off: hidden })),
        panel && ReactDOM && typeof ReactDOM.createPortal === 'function'
          ? ReactDOM.createPortal(panel, document.body)
          : panel,
      ])
    }

    /* --------------------------- settings UI --------------------------- */

    var PRICE_FIELDS = [
      { key: 'input', label: 'inputMiss' },
      { key: 'output', label: 'output' },
      { key: 'cacheHit', label: 'cacheHit' },
      { key: 'cacheWrite', label: 'cacheWrite' },
    ]

    function emptyPriceRow() {
      return { input: '', output: '', cacheHit: '', cacheWrite: '' }
    }

    function normalizeRow(key, row) {
      var peak = row && row.peak ? row.peak : {}
      var off = row && row.off ? row.off : {}
      // A row-level `schedule` is a per-model override of the shared Peak
      // windows/days/holidays; absent means "follow the shared schedule".
      var schedule = row && row.schedule && typeof row.schedule === 'object' ? row.schedule : null
      return {
        key: key,
        currency: row && row.currency === 'CNY' ? 'CNY' : 'USD',
        peak: {
          input: peak.input === null || peak.input === undefined ? '' : String(peak.input),
          output: peak.output === null || peak.output === undefined ? '' : String(peak.output),
          cacheHit: peak.cacheHit === null || peak.cacheHit === undefined ? '' : String(peak.cacheHit),
          cacheWrite: peak.cacheWrite === null || peak.cacheWrite === undefined ? '' : String(peak.cacheWrite),
        },
        off: {
          input: off.input === null || off.input === undefined ? '' : String(off.input),
          output: off.output === null || off.output === undefined ? '' : String(off.output),
          cacheHit: off.cacheHit === null || off.cacheHit === undefined ? '' : String(off.cacheHit),
          cacheWrite: off.cacheWrite === null || off.cacheWrite === undefined ? '' : String(off.cacheWrite),
        },
        schedule: {
          enabled: Boolean(schedule),
          peakWindows: schedule && typeof schedule.peakWindows === 'string' ? schedule.peakWindows : '',
          peakDays: schedule && Array.isArray(schedule.peakDays) ? schedule.peakDays.slice() : [],
          holidays: schedule && Array.isArray(schedule.holidays) ? schedule.holidays.slice() : [],
        },
        // Provenance of the numbers: the page they were taken from and the date
        // they were checked. Optional, free-form for the user.
        source: {
          url: row && row.source && typeof row.source.url === 'string' ? row.source.url : '',
          checkedAt: row && row.source && typeof row.source.checkedAt === 'string' ? row.source.checkedAt : '',
        },
      }
    }

    function SettingsSection(props) {
      var dshLocale = typeof props.dshLocale === 'function' ? props.dshLocale() : props.dshLocale
      var loadBox = useState(null)
      var loaded = loadBox[0]
      var setLoaded = loadBox[1]
      var draftBox = useState(null)
      var draft = draftBox[0]
      var setDraft = draftBox[1]
      var rowsBox = useState([])
      var rows = rowsBox[0]
      var setRows = rowsBox[1]
      var statusBox = useState('')
      var displayStatus = statusBox[0]
      var setDisplayStatus = statusBox[1]
      var scheduleStatusBox = useState('')
      var scheduleStatus = scheduleStatusBox[0]
      var setScheduleStatus = scheduleStatusBox[1]
      var modelsStatusBox = useState('')
      var modelsStatus = modelsStatusBox[0]
      var setModelsStatus = modelsStatusBox[1]
      var addBox = useState({ provider: '', model: '' })
      var add = addBox[0]
      var setAdd = addBox[1]
      var allTimeBox = useState(null)
      var allTime = allTimeBox[0]
      var setAllTime = allTimeBox[1]
      var expandedBox = useState({})
      var expanded = expandedBox[0]
      var setExpanded = expandedBox[1]
      var sourceOpenBox = useState({})
      var sourceOpen = sourceOpenBox[0]
      var setSourceOpen = sourceOpenBox[1]
      var catalogBox = useState('')
      var catalogStatus = catalogBox[0]
      var setCatalogStatus = catalogBox[1]
      var updateStatusBox = useState('')
      var updateStatus = updateStatusBox[0]
      var setUpdateStatus = updateStatusBox[1]
      var dialogBox = useState(false)
      var dialog = dialogBox[0]
      var setDialog = dialogBox[1]
      var dialogInfoBox = useState(null)
      var dialogInfo = dialogInfoBox[0]
      var setDialogInfo = dialogInfoBox[1]
      var dialogStatusBox = useState('')
      var dialogStatus = dialogStatusBox[0]
      var setDialogStatus = dialogStatusBox[1]
      var localeData = useLocaleData()

      var refresh = useCallback(function () {
        return call('config', {}).then(function (value) {
          setLoaded(value)
          setDraft({
            displayCurrency: value.config.displayCurrency,
            rate: String(value.config.rate),
            peakWindows: value.config.peakWindows,
            peakDays: Array.isArray(value.config.peakDays) ? value.config.peakDays : [1, 2, 3, 4, 5],
            holidays: Array.isArray(value.config.holidays) ? value.config.holidays : [],
            language: value.config.language,
            hideWallet: Boolean(value.config.hideWallet),
            hideLine: Boolean(value.config.hideLine),
            checkUpdates: value.config.checkUpdates !== false,
            showBestTime: value.config.showBestTime !== false,
            budget: value.config.budget === null || value.config.budget === undefined ? '' : String(value.config.budget),
            includeRequests: value.config.includeRequests !== false,
            searchPrice: String(value.config.searchPrice),
            fetchPrice: String(value.config.fetchPrice),
            requestBillingFrom: value.config.requestBillingFrom,
          })
          var keys = value.models.slice()
          setRows(keys.map(function (key) { return normalizeRow(key, value.config.prices[key]) }))
          setAllTime(value.allTime)
        })
      }, [])

      useEffect(function () { refresh().catch(function (error) { setDisplayStatus('error:' + String(error.message || error)) }) }, [refresh])
      useEffect(function () { loadLocales(true) }, [])
      useEffect(function () {
        if (!dialog) return undefined
        function onKey(event) { if (event.key === 'Escape') setDialog(false) }
        document.addEventListener('keydown', onKey)
        return function () { document.removeEventListener('keydown', onKey) }
      }, [dialog])

      if (!loaded || !draft) {
        return h('div', { className: 'mp-settings' }, h('div', { className: 'mp-muted' }, translator('auto', dshLocale, localeData)('loading')))
      }

      var t = translator(draft.language, dshLocale, localeData)
      var localeTag = resolveLocaleTag(localeData, draft.language, dshLocale)

      var localeOptions = (localeData.list || []).slice()
      if (localeOptions.length === 0) {
        localeOptions = [{ tag: 'en', name: 'English' }, { tag: 'ru', name: 'Русский' }]
      }
      if (draft.language !== 'auto' && !localeOptions.some(function (entry) { return entry.tag === draft.language })) {
        localeOptions.push({ tag: draft.language, name: draft.language })
      }

      function field(key, value) {
        setDraft(Object.assign({}, draft, (function () { var patch = {}; patch[key] = value; return patch })()))
      }

      function patchRow(index, mutate) {
        setRows(rows.map(function (row, i) { return i === index ? mutate(row) : row }))
      }

      function setPrice(index, tariff, priceKey, value) {
        patchRow(index, function (row) {
          var next = Object.assign({}, row)
          next[tariff] = Object.assign({}, row[tariff])
          next[tariff][priceKey] = value
          return next
        })
      }

      /** Weekday checkboxes for Peak days, shared by the global and per-model schedule. */
      function daysRow(value, onChange) {
        return h('div', { key: 'd', style: { display: 'flex', gap: 10, flexWrap: 'wrap' } }, weekdayNames(localeTag).map(function (name, index) {
          var dayNumber = index + 1
          return h('label', {
            key: 'd' + dayNumber,
            className: 'mp-check-row',
            style: { fontSize: 12 },
          }, [
            h('input', {
              key: 'i', type: 'checkbox', checked: (value || []).indexOf(dayNumber) !== -1,
              onChange: function (event) {
                var days = (value || []).slice()
                var position = days.indexOf(dayNumber)
                if (event.target.checked && position === -1) days.push(dayNumber)
                if (!event.target.checked && position !== -1) days.splice(position, 1)
                onChange(days.sort(function (a, b) { return a - b }))
              },
            }),
            h('span', { key: 's' }, name),
          ])
        }))
      }

      function setRowSchedule(index, patch) {
        patchRow(index, function (row) {
          return Object.assign({}, row, { schedule: Object.assign({}, row.schedule, patch) })
        })
      }

      function setRowSource(index, key, value) {
        patchRow(index, function (row) {
          var source = Object.assign({}, row.source)
          source[key] = value
          return Object.assign({}, row, { source: source })
        })
      }

      /** Host part of a URL, or '' when the text is not an absolute http(s) URL. */
      function hostOf(url) {
        try {
          var parsed = new URL(url)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
          return parsed.host
        } catch (error) {
          return ''
        }
      }

      /** Turning an override on seeds it from the shared schedule, so the card
       *  opens with the values that were in effect instead of a blank form. */
      function toggleRowSchedule(index, enabled) {
        patchRow(index, function (row) {
          var schedule = Object.assign({}, row.schedule, { enabled: enabled })
          if (enabled) {
            if (!schedule.peakWindows) schedule.peakWindows = draft.peakWindows
            if (!schedule.peakDays || schedule.peakDays.length === 0) schedule.peakDays = (draft.peakDays || []).slice()
            if (!schedule.holidays || schedule.holidays.length === 0) schedule.holidays = (draft.holidays || []).slice()
          }
          return Object.assign({}, row, { schedule: schedule })
        })
      }

      function summaryOf(row) {
        var peak = row.peak || {}
        var parts = []
        if (peak.input) parts.push(t('sumIn') + ' ' + peak.input)
        if (peak.output) parts.push(t('sumOut') + ' ' + peak.output)
        if (peak.cacheHit) parts.push(t('sumHit') + ' ' + peak.cacheHit)
        if (row.schedule && row.schedule.enabled) parts.push(t('ownSchedule'))
        return parts.length > 0 ? parts.join(' · ') : t('noPrice')
      }

      function toggleRow(key) {
        var next = Object.assign({}, expanded)
        if (next[key]) delete next[key]
        else next[key] = true
        setExpanded(next)
      }

      function expandAll() {
        var next = {}
        for (var i = 0; i < rows.length; i += 1) next[rows[i].key] = true
        setExpanded(next)
      }

      function toggleSource(key) {
        var next = Object.assign({}, sourceOpen)
        if (next[key]) delete next[key]
        else next[key] = true
        setSourceOpen(next)
      }

      function loadModels() {
        setCatalogStatus('loading')
        call('catalog', {}).then(function (value) {
          // Mirror Settings → Models: the configured list replaces the table, so
          // rows for models that are no longer bound disappear together with
          // their prices.
          var next = []
          for (var i = 0; i < value.models.length; i += 1) {
            var item = value.models[i]
            var key = item.provider + '/' + item.model
            var known = loaded && loaded.config && loaded.config.prices ? loaded.config.prices[key] : undefined
            next.push(normalizeRow(key, known))
          }
          setRows(next)
          setCatalogStatus('synced:' + next.length)
        }).catch(function (error) {
          setCatalogStatus('error:' + String(error.message || error))
        })
      }

      function saveDisplay() {
        setDisplayStatus('saving')
        call('save', {
          displayCurrency: draft.displayCurrency,
          rate: draft.rate,
          language: draft.language,
          hideWallet: draft.hideWallet,
          hideLine: draft.hideLine,
          checkUpdates: draft.checkUpdates,
          showBestTime: draft.showBestTime,
          budget: draft.budget === '' ? null : draft.budget,
        }).then(function (value) {
          setDisplayStatus('saved')
          setLoaded(value)
        }).catch(function (error) {
          setDisplayStatus('error:' + String(error.message || error))
        })
      }

      function saveSchedule() {
        setScheduleStatus('saving')
        call('save', {
          peakWindows: draft.peakWindows,
          peakDays: draft.peakDays,
          holidays: draft.holidays,
          includeRequests: draft.includeRequests,
          searchPrice: draft.searchPrice,
          fetchPrice: draft.fetchPrice,
          requestBillingFrom: draft.requestBillingFrom,
        }).then(function (value) {
          setScheduleStatus('saved')
          setLoaded(value)
        }).catch(function (error) {
          setScheduleStatus('error:' + String(error.message || error))
        })
      }

      function saveModels() {
        setModelsStatus('saving')
        var prices = {}
        for (var i = 0; i < rows.length; i += 1) {
          var row = rows[i]
          if (!row || !row.key) continue
          if (row.peak.input !== '' || row.peak.output !== '') {
            var schedule = null
            if (row.schedule && row.schedule.enabled) {
              schedule = {
                peakWindows: row.schedule.peakWindows,
                peakDays: row.schedule.peakDays,
                holidays: row.schedule.holidays,
              }
            }
            var source = null
            if (row.source && (row.source.url.trim() || row.source.checkedAt.trim())) {
              source = { url: row.source.url.trim(), checkedAt: row.source.checkedAt.trim() }
            }
            prices[row.key] = {
              currency: row.currency,
              peak: { input: row.peak.input, output: row.peak.output, cacheHit: row.peak.cacheHit, cacheWrite: row.peak.cacheWrite },
              off: { input: row.off.input, output: row.off.output, cacheHit: row.off.cacheHit, cacheWrite: row.off.cacheWrite },
              schedule: schedule,
              source: source,
            }
          }
        }
        call('save', { prices: prices }).then(function (value) {
          setModelsStatus('saved')
          setAllTime(value.allTime)
          setLoaded(value)
        }).catch(function (error) {
          setModelsStatus('error:' + String(error.message || error))
        })
      }

      function toggleUpdates(event) {
        var next = event.target.checked
        setDraft(Object.assign({}, draft, { checkUpdates: next }))
        setUpdateStatus('')
        call('save', { checkUpdates: next }).then(function (value) {
          setLoaded(value)
        }).catch(function () {
          setDraft(Object.assign({}, draft, { checkUpdates: !next }))
        })
      }

      function openUpdateDialog() {
        setDialog(true)
        setDialogStatus('checking')
        setDialogInfo(null)
        call('updateInfo', {}).then(function (value) {
          setDialogInfo(value)
          setDialogStatus('ready')
          setUpdateStatus(value && value.available ? 'found' : 'ok')
        }).catch(function (error) {
          setDialogStatus('error:' + String(error.message || error))
        })
      }

      function closeUpdateDialog() {
        setDialog(false)
      }

      function refreshUpdateInfo() {
        setDialogStatus('checking')
        call('updateInfo', {}).then(function (value) {
          setDialogInfo(value)
          setDialogStatus('ready')
        }).catch(function (error) {
          setDialogStatus('error:' + String(error.message || error))
        })
      }

      function copyCommand() {
        var text = (dialogInfo && dialogInfo.command) || ''
        if (!text) return
        var done = function () { setDialogStatus('copied') }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () { setDialogStatus('copy-failed') })
          return
        }
        try {
          var area = document.createElement('textarea')
          area.value = text
          document.body.appendChild(area)
          area.select()
          document.execCommand('copy')
          document.body.removeChild(area)
          done()
        } catch (error) {
          setDialogStatus('copy-failed')
        }
      }

      function startAutoUpdate() {
        setDialogStatus('starting')
        call('update', {}).then(function (value) {
          if (value && value.started) setDialogStatus('started')
          else setDialogStatus('manual:' + String((value && value.reason) || 'unknown'))
        }).catch(function () {
          // Swapping the bundle can drop the response after the update started.
          setDialogStatus('started')
        })
      }

      function dialogNote() {
        if (dialogStatus === 'started') return h('span', { className: 'mp-ok' }, t('updateStarted'))
        if (dialogStatus === 'copied') return h('span', { className: 'mp-ok' }, t('updateCopied'))
        if (dialogStatus === 'copy-failed') return h('span', { className: 'mp-err' }, t('updateFailed'))
        if (dialogStatus.indexOf('error:') === 0) return h('span', { className: 'mp-err' }, t('updateFailed') + ': ' + dialogStatus.slice(6))
        if (dialogStatus === 'starting') return h('span', { className: 'mp-muted' }, t('checking'))
        if (dialogStatus.indexOf('manual:') === 0) {
          var reason = dialogStatus.slice(7)
          if (reason === 'local') return h('span', { className: 'mp-muted' }, t('updateLocalOnly'))
          if (reason === 'up-to-date') return h('span', { className: 'mp-ok' }, t('upToDate'))
          return h('span', { className: 'mp-muted' }, t('updateNoManager'))
        }
        return null
      }

      function addModel() {
        var provider = add.provider.trim()
        var model = add.model.trim()
        if (!provider || !model) return
        var key = provider + '/' + model
        if (rows.some(function (row) { return row.key === key })) return
        setRows(rows.concat([normalizeRow(key, null)]))
        setAdd({ provider: '', model: '' })
      }

      function removeRow(index) {
        setRows(rows.filter(function (_, i) { return i !== index }))
      }

      function statusText(value) {
        if (value === 'saving') return h('span', { key: 'st', className: 'mp-muted' }, t('saving'))
        if (value === 'saved') return h('span', { key: 'st', className: 'mp-ok' }, t('saved'))
        if (value.indexOf('error:') === 0) return h('span', { key: 'st', className: 'mp-err' }, t('failed') + ': ' + value.slice(6))
        return null
      }

      return h('div', { className: 'mp-settings' }, [
        h('h2', { key: 't' }, t('settingsTitle')),
        h('p', { className: 'intro', key: 'i' }, t('settingsIntro')),
        h('p', { className: 'intro', key: 'peak', style: { marginTop: -8 } }, t('peakExplainer')),
        allTime ? h('div', { className: 'mp-card', key: 'sum' }, [
          h('div', { className: 'mp-summary' }, [
            h('div', { key: 'a' }, [
              h('span', { className: 'l' }, t('allTime') + ' (' + t('since') + ' ' + day(allTime.since, localeTag) + ')'),
              h('span', { className: 'v' }, money(allTime.total, allTime.currency)),
            ]),
            h('div', { key: 'r' }, [
              h('span', { className: 'l' }, t('rate')),
              h('span', { className: 'v' }, interpolate(t('rateLine'), { rate: Number(draft.rate || 0).toFixed(2) })),
            ]),
          ]),
        ]) : null,
        h('div', { className: 'mp-card', key: 'display' }, [
          h('h3', { key: 'h' }, t('display')),
          h('div', { className: 'mp-grid' }, [
            h('div', { className: 'mp-field', key: 'cur' }, [
              h('label', { key: 'l' }, t('displayCurrency')),
              h('select', {
                key: 'i', className: 'mp-sel', value: draft.displayCurrency,
                onChange: function (event) { field('displayCurrency', event.target.value) },
              }, [
                h('option', { key: 'usd', value: 'USD' }, 'USD ($)'),
                h('option', { key: 'cny', value: 'CNY' }, 'CNY (¥)'),
              ]),
            ]),
            h('div', { className: 'mp-field', key: 'rate' }, [
              h('label', { key: 'l' }, t('rateLabel')),
              h('input', {
                key: 'i', className: 'mp-in', inputMode: 'decimal', value: draft.rate,
                onChange: function (event) { field('rate', event.target.value) },
              }),
              h('span', { className: 'hint', key: 'h' }, t('rateHint')),
            ]),
            h('div', { className: 'mp-field', key: 'lang' }, [
              h('label', { key: 'l' }, t('language')),
              h('select', {
                key: 'i', className: 'mp-sel', value: draft.language,
                onChange: function (event) { field('language', event.target.value) },
              }, [h('option', { key: 'auto', value: 'auto' }, t('langAuto'))].concat(
                localeOptions.map(function (entry) {
                  return h('option', { key: entry.tag, value: entry.tag }, entry.name + ' (' + entry.tag + ')')
                })
              )),
            ]),
            h('div', { className: 'mp-field', key: 'budget' }, [
              h('label', { key: 'l' }, t('budgetLabel')),
              h('input', {
                key: 'i', className: 'mp-in', inputMode: 'decimal', value: draft.budget,
                onChange: function (event) { field('budget', event.target.value) },
              }),
              h('span', { className: 'hint', key: 'h' }, t('budgetHint')),
            ]),
          ]),
          h('div', { className: 'mp-field', key: 'besttime', style: { marginTop: 10 } }, [
            h('label', {
              key: 'cb',
              style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--dsw-alias-label-primary)' },
            }, [
              h('input', {
                key: 'i', type: 'checkbox', checked: draft.showBestTime,
                onChange: function (event) { field('showBestTime', event.target.checked) },
              }),
              h('span', { key: 's' }, t('showBestTimeLabel')),
            ]),
            h('span', { className: 'hint', key: 'h' }, t('showBestTimeHint')),
          ]),
          h('div', { className: 'mp-grid', key: 'visibility', style: { marginTop: 10 } }, [
            h('div', { className: 'mp-field', key: 'hidew' }, [
              h('label', { key: 'l' }, t('hideWalletLabel')),
              h('label', { key: 'cb', style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 } }, [
                h('input', {
                  key: 'i', type: 'checkbox', checked: draft.hideWallet,
                  onChange: function (event) { field('hideWallet', event.target.checked) },
                }),
                h('span', { key: 's' }, t('hideWalletHint')),
              ]),
            ]),
            h('div', { className: 'mp-field', key: 'hidel' }, [
              h('label', { key: 'l' }, t('hideLineLabel')),
              h('label', { key: 'cb', style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 } }, [
                h('input', {
                  key: 'i', type: 'checkbox', checked: draft.hideLine,
                  onChange: function (event) { field('hideLine', event.target.checked) },
                }),
                h('span', { key: 's' }, t('hideLineHint')),
              ]),
            ]),
          ]),
          h('div', { className: 'mp-card-foot', key: 'foot' }, [
            statusText(displayStatus),
            h('button', {
              key: 'ap', className: 'mp-btn pri',
              disabled: displayStatus === 'saving',
              onClick: saveDisplay,
            }, t('apply')),
          ]),
        ]),
        h('div', { className: 'mp-card', key: 'schedule' }, [
          h('h3', { key: 'h' }, t('discountsTitle')),
          h('div', { className: 'mp-muted', key: 'i', style: { marginTop: -4, marginBottom: 8, fontSize: 11, lineHeight: 1.5 } }, t('discountsHint')),
          h('div', { className: 'mp-field', key: 'windows' }, [
            h('label', { key: 'l' }, t('peakWindowsLabel')),
            h('input', {
              key: 'i', className: 'mp-in', placeholder: '01:00-04:00, 06:00-10:00', value: draft.peakWindows,
              onChange: function (event) { field('peakWindows', event.target.value) },
            }),
            h('span', { className: 'hint', key: 'h' }, t('peakWindowsHint')),
          ]),
          h('div', { className: 'mp-field', key: 'days', style: { marginTop: 10 } }, [
            h('label', { key: 'l' }, t('peakDaysLabel')),
            daysRow(draft.peakDays, function (days) { field('peakDays', days) }),
          ]),
          h('div', { className: 'mp-field', key: 'holidays', style: { marginTop: 10 } }, [
            h('label', { key: 'l' }, t('holidaysLabel')),
            h('input', {
              key: 'i', className: 'mp-in', placeholder: '2026-10-01, 2026-10-02',
              value: (draft.holidays || []).join(', '),
              onChange: function (event) {
                var list = event.target.value.split(',').map(function (part) { return part.trim() }).filter(Boolean)
                field('holidays', list)
              },
            }),
            h('span', { className: 'hint', key: 'h' }, t('holidaysHint')),
          ]),
          h('h3', { key: 'reqh', style: { marginTop: 18 } }, t('requestsTitle')),
          h('div', { className: 'mp-field', key: 'reqcb' }, [
            h('label', {
              key: 'cb',
              style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--dsw-alias-label-primary)' },
            }, [
              h('input', {
                key: 'i', type: 'checkbox', checked: draft.includeRequests,
                onChange: function (event) { field('includeRequests', event.target.checked) },
              }),
              h('span', { key: 's' }, t('includeRequestsLabel')),
            ]),
          ]),
          h('div', { className: 'mp-grid', key: 'reqp', style: { marginTop: 8 } }, [
            h('div', { className: 'mp-field', key: 'sp' }, [
              h('label', { key: 'l' }, t('searchPriceLabel')),
              h('input', {
                key: 'i', className: 'mp-in', inputMode: 'decimal', value: draft.searchPrice,
                onChange: function (event) { field('searchPrice', event.target.value) },
              }),
            ]),
            h('div', { className: 'mp-field', key: 'fp' }, [
              h('label', { key: 'l' }, t('fetchPriceLabel')),
              h('input', {
                key: 'i', className: 'mp-in', inputMode: 'decimal', value: draft.fetchPrice,
                onChange: function (event) { field('fetchPrice', event.target.value) },
              }),
            ]),
          ]),
          h('div', { className: 'mp-field', key: 'reqfrom', style: { marginTop: 8 } }, [
            h('label', { key: 'l' }, t('billingFromLabel')),
            h('input', {
              key: 'i', className: 'mp-in', value: draft.requestBillingFrom,
              onChange: function (event) { field('requestBillingFrom', event.target.value) },
            }),
            h('span', { className: 'hint', key: 'h' }, t('billingFromHint')),
          ]),
          h('div', { className: 'mp-card-foot', key: 'foot' }, [
            statusText(scheduleStatus),
            h('button', {
              key: 'ap', className: 'mp-btn pri',
              disabled: scheduleStatus === 'saving',
              onClick: saveSchedule,
            }, t('apply')),
          ]),
        ]),
        h('div', { className: 'mp-card', key: 'models' }, [
          h('h3', { key: 'h' }, t('models')),
          h('div', { className: 'mp-model-toolbar', key: 'bar' }, [
            h('button', {
              key: 'load', className: 'mp-btn',
              disabled: catalogStatus === 'loading',
              onClick: loadModels,
            }, catalogStatus === 'loading' ? t('loadingModels') : t('loadModels')),
            catalogStatus.indexOf('synced:') === 0
              ? h('span', { key: 'st', className: 'mp-ok' }, t('modelsSynced').replace('{n}', catalogStatus.slice(7)))
              : null,
            catalogStatus === 'empty' ? h('span', { key: 'st2', className: 'mp-muted' }, t('noNewModels')) : null,
            catalogStatus.indexOf('error:') === 0
              ? h('span', { key: 'st3', className: 'mp-err' }, t('loadFailed') + ': ' + catalogStatus.slice(6))
              : null,
            h('span', { key: 'sp', className: 'spacer' }),
            h('button', { key: 'exp', className: 'mp-btn ghost', onClick: expandAll }, t('expandAll')),
            h('button', { key: 'col', className: 'mp-btn ghost', onClick: function () { setExpanded({}) } }, t('collapseAll')),
          ]),
          h('div', { className: 'mp-muted', key: 'loadhint', style: { marginTop: -4, marginBottom: 8, fontSize: 10.5 } }, t('loadModelsHint')),
          rows.length === 0 ? h('div', { className: 'mp-muted', key: 'empty' }, t('noModels')) : null,
          rows.map(function (row, index) {
            var isOpen = expanded[row.key] === true
            return h('div', { className: 'mp-model-card', key: row.key || index, style: { marginBottom: 10 } }, [
              h('div', {
                className: 'mp-model-head',
                key: 'head',
                role: 'button',
                tabIndex: 0,
                'aria-expanded': isOpen,
                onClick: function () { toggleRow(row.key) },
                onKeyDown: function (event) {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleRow(row.key) }
                },
              }, [
                h('span', { className: 'mp-chev' + (isOpen ? ' open' : ''), key: 'ch' }, '▸'),
                h('span', { className: 'mp-model-name', key: 'n' }, row.key),
                isOpen ? null : h('span', { className: 'mp-model-summary', key: 'sum' }, summaryOf(row)),
                h('span', { key: 'sp', className: 'spacer' }),
                h('label', {
                  key: 'cur',
                  style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
                  onClick: function (event) { event.stopPropagation() },
                }, [
                  t('currency'),
                  h('select', {
                    key: 's', className: 'mp-sel', style: { width: 82, height: 26 },
                    value: row.currency,
                    onChange: function (event) {
                      event.stopPropagation()
                      patchRow(index, function (current) { return Object.assign({}, current, { currency: event.target.value }) })
                    },
                  }, [h('option', { key: 'u', value: 'USD' }, 'USD'), h('option', { key: 'c', value: 'CNY' }, 'CNY')]),
                ]),
                h('button', {
                  key: 'rm', className: 'mp-btn ghost',
                  onClick: function (event) { event.stopPropagation(); removeRow(index) },
                }, t('remove')),
              ]),
              isOpen ? h('div', { className: 'mp-model-body', key: 'body' }, [
                h('div', { className: 'mp-source', key: 'src' }, [
                  h('div', {
                    className: 'mp-source-head', key: 'head', role: 'button', tabIndex: 0,
                    'aria-expanded': Boolean(sourceOpen[row.key]),
                    onClick: function () { toggleSource(row.key) },
                    onKeyDown: function (event) {
                      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSource(row.key) }
                    },
                  }, [
                    h('span', { className: 'mp-chev' + (sourceOpen[row.key] ? ' open' : ''), key: 'ch' }, '▸'),
                    h('span', { className: 'mp-source-title', key: 't' }, t('sourceTitle')),
                  ]),
                  sourceOpen[row.key] ? h('div', { className: 'mp-source-grid', key: 'g' }, [
                    h('div', { className: 'mp-field', key: 'u' }, [
                      h('label', { key: 'l' }, t('sourceUrlLabel')),
                      h('input', {
                        key: 'i', className: 'mp-in', placeholder: 'https://api-docs.deepseek.com/quick_start/pricing',
                        value: row.source.url,
                        onClick: function (event) { event.stopPropagation() },
                        onChange: function (event) { setRowSource(index, 'url', event.target.value) },
                      }),
                      h('span', { className: 'hint', key: 'h' }, t('sourceUrlHint')),
                    ]),
                    h('div', { className: 'mp-field', key: 'd' }, [
                      h('label', { key: 'l' }, t('checkedAtLabel')),
                      h('input', {
                        key: 'i', className: 'mp-in', placeholder: '2026-10-21',
                        value: row.source.checkedAt,
                        onClick: function (event) { event.stopPropagation() },
                        onChange: function (event) { setRowSource(index, 'checkedAt', event.target.value) },
                      }),
                      h('span', { className: 'hint', key: 'h' }, t('checkedAtHint')),
                    ]),
                  ]) : null,
                  hostOf(row.source.url) || row.source.checkedAt
                    ? h('div', { className: 'mp-source-line', key: 'line' }, [
                      hostOf(row.source.url) ? h('span', { key: 'host', className: 'mp-source-host' }, hostOf(row.source.url)) : null,
                      row.source.checkedAt ? h('span', { key: 'date' }, interpolate(t('checkedAtLine'), { date: row.source.checkedAt })) : null,
                      hostOf(row.source.url) ? h('a', {
                        key: 'open', className: 'mp-btn ghost',
                        href: row.source.url, target: '_blank', rel: 'noopener noreferrer',
                        onClick: function (event) { event.stopPropagation() },
                      }, t('sourceOpen')) : null,
                    ])
                    : null,
                ]),
                h('div', { className: 'mp-tariff', key: 'tp' }, t('peakColumn')),
                h('div', { className: 'mp-price-grid', key: 'peak' }, [h('span', { key: 'x', className: 'rh' }, '')].concat(
                  PRICE_FIELDS.map(function (f) { return h('span', { key: 'h-' + f.key, className: 'h' }, t(f.label)) })
                ).concat([h('span', { key: 'row', className: 'rh' }, t('peak'))]).concat(
                  PRICE_FIELDS.map(function (f) {
                    return h('input', {
                      key: 'i-' + f.key, className: 'mp-in', inputMode: 'decimal',
                      value: row.peak[f.key],
                      placeholder: '—',
                      onClick: function (event) { event.stopPropagation() },
                      onChange: function (event) { setPrice(index, 'peak', f.key, event.target.value) },
                    })
                  })
                )),
                h('div', { className: 'mp-tariff', key: 'to' }, t('offColumn') + ' (' + t('offEmpty') + ')'),
                h('div', { className: 'mp-price-grid', key: 'off' }, [h('span', { key: 'x', className: 'rh' }, '')].concat(
                  PRICE_FIELDS.map(function (f) { return h('span', { key: 'h-' + f.key, className: 'h' }, t(f.label)) })
                ).concat([h('span', { key: 'row', className: 'rh' }, t('offPeak'))]).concat(
                  PRICE_FIELDS.map(function (f) {
                    return h('input', {
                      key: 'i-' + f.key, className: 'mp-in', inputMode: 'decimal',
                      value: row.off[f.key],
                      placeholder: '—',
                      onClick: function (event) { event.stopPropagation() },
                      onChange: function (event) { setPrice(index, 'off', f.key, event.target.value) },
                    })
                  })
                )),
                h('div', { className: 'mp-model-schedule', key: 'sch' }, [
                  h('label', { key: 'cb', className: 'mp-check-row' }, [
                    h('input', {
                      key: 'i', type: 'checkbox', checked: row.schedule.enabled,
                      onChange: function (event) { toggleRowSchedule(index, event.target.checked) },
                    }),
                    h('span', { key: 's' }, t('modelScheduleLabel')),
                  ]),
                  row.schedule.enabled
                    ? h('div', { key: 'own', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, [
                      h('div', { className: 'mp-field', key: 'w' }, [
                        h('label', { key: 'l' }, t('peakWindowsLabel')),
                        h('input', {
                          key: 'i', className: 'mp-in', placeholder: '01:00-04:00, 06:00-10:00',
                          value: row.schedule.peakWindows,
                          onChange: function (event) { setRowSchedule(index, { peakWindows: event.target.value }) },
                        }),
                      ]),
                      h('div', { className: 'mp-field', key: 'd' }, [
                        h('label', { key: 'l' }, t('peakDaysLabel')),
                        daysRow(row.schedule.peakDays, function (days) { setRowSchedule(index, { peakDays: days }) }),
                      ]),
                      h('div', { className: 'mp-field', key: 'h' }, [
                        h('label', { key: 'l' }, t('holidaysLabel')),
                        h('input', {
                          key: 'i', className: 'mp-in', placeholder: '2026-10-01, 2026-10-02',
                          value: (row.schedule.holidays || []).join(', '),
                          onChange: function (event) {
                            var list = event.target.value.split(',').map(function (part) { return part.trim() }).filter(Boolean)
                            setRowSchedule(index, { holidays: list })
                          },
                        }),
                        h('span', { className: 'hint', key: 'sh' }, t('modelScheduleHint')),
                      ]),
                    ])
                    : h('span', { key: 'inherit', className: 'hint' }, interpolate(t('modelScheduleInherit'), { windows: draft.peakWindows })),
                ]),
              ]) : null,
            ])
          }),
          h('div', { className: 'mp-add', key: 'add', style: { marginTop: 12 } }, [
            h('div', { className: 'mp-field', key: 'p' }, [
              h('label', { key: 'l' }, t('provider')),
              h('input', {
                key: 'i', className: 'mp-in', value: add.provider, placeholder: 'deepseek',
                onChange: function (event) { setAdd(Object.assign({}, add, { provider: event.target.value })) },
              }),
            ]),
            h('div', { className: 'mp-field', key: 'm' }, [
              h('label', { key: 'l' }, t('modelId')),
              h('input', {
                key: 'i', className: 'mp-in', value: add.model, placeholder: 'deepseek-v4-pro',
                onChange: function (event) { setAdd(Object.assign({}, add, { model: event.target.value })) },
              }),
            ]),
            h('button', { key: 'b', className: 'mp-btn', onClick: addModel }, t('add')),
          ]),
          h('div', { className: 'mp-card-foot', key: 'foot' }, [
            statusText(modelsStatus),
            h('button', {
              key: 'ap', className: 'mp-btn pri',
              disabled: modelsStatus === 'saving',
              onClick: saveModels,
            }, t('apply')),
          ]),
        ]),
        h('div', { className: 'mp-about', key: 'about' }, [
          h('div', { className: 'mp-section', key: 'h', style: { marginTop: 0 } }, t('about')),
          h('div', { className: 'mp-about-toggle', key: 'chk' }, [
            h('label', {
              key: 'l',
              style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--dsw-alias-label-primary)' },
            }, [
              h('input', {
                key: 'i', type: 'checkbox', checked: draft.checkUpdates,
                onChange: toggleUpdates,
              }),
              h('span', { key: 's' }, t('checkUpdatesLabel')),
            ]),
            h('button', {
              key: 'now', type: 'button', className: 'mp-btn ghost',
              style: { marginLeft: 8, height: 24, padding: '0 8px', fontSize: 11 },
              onClick: openUpdateDialog,
            }, updateStatus === 'checking' ? t('checking') : t('checkNow')),
            updateStatus === 'ok' ? h('span', { key: 'ok', className: 'mp-ok' }, t('upToDate')) : null,
            updateStatus === 'found' ? h('span', { key: 'found', className: 'mp-update' }, t('updateAvailable')) : null,
            updateStatus === 'error' ? h('span', { key: 'err', className: 'mp-err' }, t('loadFailed')) : null,
            h('div', { key: 'hint', style: { fontSize: 10.5, marginTop: 2, flexBasis: '100%' } }, t('checkUpdatesHint')),
          ]),
          loaded && loaded.update && loaded.update.available
            ? h('div', { className: 'mp-update', key: 'upd' }, [
              t('updateAvailable') + ': v' + loaded.update.latest + ' · ',
              h('a', { key: 'rel', href: loaded.update.url, target: '_blank', rel: 'noopener noreferrer' }, loaded.update.url),
            ])
            : null,
          h('div', { key: 'line' }, [
            AUTHOR_NAME + ' · ',
            h('a', { key: 'mail', href: 'mailto:' + AUTHOR_EMAIL }, AUTHOR_EMAIL),
            ' · ',
            h('a', { key: 'gh', href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub'),
            ' · MIT · v' + ((loaded && loaded.config && loaded.config.version) || '1.0.0'),
          ]),
        ]),
        dialog ? h('div', {
          className: 'mp-modal',
          key: 'modal',
          onClick: function (event) { if (event.target === event.currentTarget) closeUpdateDialog() },
        }, [
          h('div', {
            className: 'mp-modal-card', key: 'card',
            role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mp-update-title',
          }, [
            h('div', { className: 'mp-modal-head', key: 'head' }, [
              h('h3', { className: 'mp-modal-title', key: 't', id: 'mp-update-title' }, t('updateTitle')),
              h('button', {
                className: 'mp-modal-x', key: 'x', type: 'button',
                'aria-label': t('close'), onClick: closeUpdateDialog,
              }, '×'),
            ]),
            h('p', { className: 'mp-modal-text', key: 'p' }, t('updateOnlyThis')),
            h('div', { className: 'mp-modal-rows', key: 'rows' }, [
              h('div', { className: 'mp-modal-row', key: 'v' }, [
                h('span', { className: 'l', key: 'l' }, t('updateRunningVersion')),
                h('span', { className: 'v', key: 'v' }, dialogInfo ? 'v' + dialogInfo.version : '…'),
              ]),
              h('div', { className: 'mp-modal-row', key: 'latest' }, [
                h('span', { className: 'l', key: 'l' }, t('updateLatestVersion')),
                h('span', { className: 'v', key: 'v' }, dialogInfo && dialogInfo.latest ? 'v' + dialogInfo.latest : '—'),
                dialogInfo
                  ? h('span', {
                    key: 's',
                    className: dialogInfo.available ? 'mp-warn' : 'mp-ok',
                  }, dialogInfo.available ? t('updateAvailable') : t('upToDate'))
                  : null,
              ]),
              h('div', { className: 'mp-modal-row', key: 'profile' }, [
                h('span', { className: 'l', key: 'l' }, t('updateTargetProfile')),
                h('span', { className: 'v', key: 'v' }, dialogInfo ? dialogInfo.profile : '—'),
              ]),
            ]),
            h('div', { className: 'mp-modal-divider', key: 'd' }),
            h('div', { className: 'mp-modal-section', key: 'manual' }, [
              h('h4', { key: 'h' }, t('updateManualTitle')),
              h('p', { key: 'p' }, t('updateManualText')),
              h('div', { className: 'mp-modal-cmd', key: 'cmd' }, [
                h('code', { key: 'c' }, dialogInfo && dialogInfo.command ? dialogInfo.command : '—'),
                h('button', {
                  key: 'copy', type: 'button', className: 'mp-btn ghost',
                  onClick: copyCommand,
                }, dialogStatus === 'copied' ? t('updateCopied') : t('updateCopy')),
              ]),
            ]),
            dialogInfo && dialogInfo.mode === 'local'
              ? h('p', { className: 'mp-modal-note', key: 'local' }, t('updateLocalOnly'))
              : null,
            dialogNote()
              ? h('div', { className: 'mp-modal-note', key: 'note' }, dialogNote())
              : null,
            h('div', { className: 'mp-modal-foot', key: 'foot' }, [
              h('button', {
                className: 'mp-btn ghost', type: 'button',
                disabled: dialogStatus === 'checking',
                onClick: refreshUpdateInfo,
              }, t('updateCheckAgain')),
              h('button', {
                className: 'mp-btn pri', type: 'button',
                disabled: !dialogInfo || !dialogInfo.canAuto || dialogStatus === 'starting' || dialogStatus === 'started',
                onClick: startAutoUpdate,
              }, dialogStatus === 'starting' ? t('checking') : t('updateAuto')),
            ]),
          ]),
        ]) : null,
      ])
    }

    /* ------------------------------ plugin ----------------------------- */

    function apply(ctx) {
      var styleEl = document.createElement('style')
      styleEl.setAttribute('data-dsh-model-price', '')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
      ctx.effect(function () { return function () { styleEl.remove() } }, 'model-price: styles')

      var dshLocale = function () {
        try {
          var snapshot = ctx.locale.getSnapshot()
          return snapshot && (snapshot.id || (snapshot.active && snapshot.active.id)) || 'en'
        } catch (error) {
          return 'en'
        }
      }

      void loadLocales()

      ctx.slots.inject('conversation.composer.dock', function () {
        return ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'spend',
          order: 2,
          inject: function () { return { props: { dshLocale: dshLocale } } },
        }, SpendLine)
      })

      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register({
          name: 'settings.section',
          id: 'model-price',
          order: 30,
          label: function () {
            var text = translator(LAST_CONFIG ? LAST_CONFIG.language : 'auto', dshLocale(), LOCALE_DATA)('settingsNav')
            return text === 'settingsNav' ? 'Model Price' : text
          },
          inject: function () { return { props: { dshLocale: dshLocale } } },
        }, SettingsSection)
      })
    }

    return { inject: ['slots', 'locale'], apply: apply }
  },
})
