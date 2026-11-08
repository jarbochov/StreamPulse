import { ALERT_PRESENTATION_KEYS, ALERT_SAMPLE, ALERT_SAMPLE_IMAGE, alertSample, playAlert, prepareAlertNode, resolveAlertLook } from './alerts.js';
import { BUILTIN_SOUNDS, playBuiltinSound, playSoundValue, resolveSoundUrl, zzfxSamples } from './audio.js';
import { setEffectsPaused } from './effects.js';
import { root } from './environment.js';
import { applyMediaFilter } from './filters.js';
import { GOOGLE_FONTS, assetFonts, loadAssetFonts, loadGoogleFont } from './fonts.js';
import { qrUrl, renderIcon } from './icons.js';
import { cleanupMedia, cleanupNode } from './lifecycle.js';
import { embedUrl, parseYouTubeUrl } from './media.js';
import { mountPattern } from './patterns.js';
import { mountSlideshow, slideshowItems } from './slideshow.js';
import { pruneSourceCaches } from './source-caches.js';
import { renderSpeakerBadge } from './speakers.js';
import { BORDER_ANIM_TYPES, BORDER_STYLES, applyBorderEffects, applyBorderGradient, borderPlacement, decorationStyle, hasBoxFill, shadowClipStyle, textEffectStyle } from './styles.js';
import { elementContent, elementItems, fitText, refreshTextSources, renderMarkdown, textSourceKey, textSourceState, wrapMarquee } from './text.js';
import { FORMAT_PRESETS, LIST_FORMAT_PRESETS, VARIABLE_GROUPS, applyFormat, expandVariables, formatDate, formatDuration, hasTicking, isDateKey, isListFormat, isListKey, loadLiveExtras, variableGroups, variableSnapshot, variableTable } from './variables.js';
import { matchesPeriodFilter, matchesPeriodToken, renderGameList, renderProgress } from './widgets.js';


root.OverlayShared = Object.assign(root.OverlayShared || {}, { cleanupMedia, cleanupNode, alertSample, ALERT_SAMPLE, ALERT_SAMPLE_IMAGE, setEffectsPaused, isListKey, isListFormat, LIST_FORMAT_PRESETS, applyBorderEffects, BORDER_STYLES, BORDER_ANIM_TYPES, applyBorderGradient, hasBoxFill, textEffectStyle, wrapMarquee, fitText, refreshTextSources, pruneSourceCaches, textSourceState, textSourceKey, elementContent, elementItems, qrUrl, renderIcon, prepareAlertNode, playAlert, playBuiltinSound, playSoundValue, resolveSoundUrl, zzfxSamples, BUILTIN_SOUNDS, renderGameList, renderSpeakerBadge, matchesPeriodFilter, matchesPeriodToken, mountSlideshow, slideshowItems, mountPattern, decorationStyle, renderProgress, GOOGLE_FONTS, VARIABLE_GROUPS, variableGroups, variableTable, formatDuration, formatDate, applyFormat, isDateKey, FORMAT_PRESETS, hasTicking, loadLiveExtras, assetFonts, loadAssetFonts, expandVariables, variableSnapshot, renderMarkdown, loadGoogleFont, parseYouTubeUrl, embedUrl, applyMediaFilter: root.OverlayFilters?.applyMediaFilter || applyMediaFilter, shadowClipStyle });
root.OverlayShared.borderPlacement = borderPlacement;
Object.assign(root.OverlayShared, { ALERT_PRESENTATION_KEYS, resolveAlertLook });
Object.defineProperty(root.OverlayShared, Symbol.for('StreamPulse.OverlayShared'), { value: true });
