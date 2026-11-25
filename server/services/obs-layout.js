const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    ASPECT_PRESETS,
    RESIZE_MODES,
    ANCHORS,
    TRANSITION_TYPES,
    PATH_TYPES,
    EASINGS,
    normalizeAspectConfig,
    resolveTargetRatio
} = require('../../shared/obs-layout.cjs');

const copy = v => JSON.parse(JSON.stringify(v));

function writeAtomic(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
}

/**
 * Generates the standalone Metal / OpenGL / D3D11 compatible OBS Lua Effect Filter (`streampulse-aspect.lua`).
 * Place upstream of `StreamPulse Border` (or standalone on any source) to crop & smoothly morph
 * between aspect ratios with Pan X/Y and Zoom at 60fps on the GPU.
 */
function buildObsAspectLuaScript({ manifestPath }) {
    const escapedPath = String(manifestPath || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `-- ============================================================================
-- StreamPulse OBS Aspect & Frame Filter (macOS Metal / OpenGL / D3D11)
-- ============================================================================
-- Load ONCE in OBS Studio -> Tools -> Scripts.
-- Add "StreamPulse Aspect" filter to any source (place ABOVE StreamPulse Border
-- if using both). Smoothly morphs aspect ratio, pan, and zoom from manifest.json.
-- ============================================================================

local obs = obslua
local MANIFEST_PATH = "${escapedPath}"

local manifest_rev = 0
local source_rules = {}
local poll_accum = 0.0

local EFFECT_SOURCE = [[
uniform float4x4 ViewProj;
uniform texture2d image;
uniform float2 uv_min;
uniform float2 uv_max;

sampler_state textureSampler {
    Filter   = Linear;
    AddressU = Clamp;
    AddressV = Clamp;
};

struct VertData {
    float4 pos : POSITION;
    float2 uv  : TEXCOORD0;
};

VertData VSDefault(VertData v_in) {
    VertData v_out;
    v_out.pos = mul(float4(v_in.pos.xyz, 1.0), ViewProj);
    v_out.uv  = v_in.uv;
    return v_out;
}

float4 PSDefault(VertData v_in) : TARGET {
    float2 sample_uv = lerp(uv_min, uv_max, v_in.uv);
    return image.Sample(textureSampler, clamp(sample_uv, 0.0, 1.0));
}

technique Draw {
    pass {
        vertex_shader = VSDefault(v_in);
        pixel_shader  = PSDefault(v_in);
    }
}
]]

local function read_file_text(file_path)
    local f = io.open(file_path, "rb")
    if not f then return nil end
    local text = f:read("*all")
    f:close()
    return text
end

local function extract_number(block, key, fallback)
    local v = string.match(block or "", '"' .. key .. '"%s*:%s*([-+]?%d*%.?%d+)')
    return v and (tonumber(v) or fallback) or fallback
end

local function extract_string(block, key, fallback)
    local v = string.match(block or "", '"' .. key .. '"%s*:%s*"([^"]*)"')
    return v or fallback
end

local function reload_manifest(force)
    local raw = read_file_text(MANIFEST_PATH)
    if not raw or raw == "" then return end
    local rev = extract_number(raw, "revision", 0)
    if not force and rev == manifest_rev and rev > 0 then return end
    manifest_rev = rev
    local next_rules = {}
    local sources_block = string.match(raw, '"sources"%s*:%s*(%b{})')
    if sources_block then
        for name, body in string.gmatch(sources_block, '"([^"]+)"%s*:%s*(%b{})') do
            next_rules[name] = {
                targetRatio = extract_number(body, "targetRatio", 0),
                panX = extract_number(body, "panX", 0),
                panY = extract_number(body, "panY", 0),
                zoom = extract_number(body, "zoom", 1),
                durationSec = math.max(0.0, extract_number(body, "durationMs", 400) / 1000.0)
            }
        end
    end
    source_rules = next_rules
end

local function ease_in_out_cubic(t)
    if t < 0.5 then return 4 * t * t * t end
    local f = -2 * t + 2
    return 1 - (f * f * f) / 2
end

local function clamp(v, lo, hi)
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

local filter_def = {}
filter_def.id = "streampulse_aspect_filter"
filter_def.type = obs.OBS_SOURCE_TYPE_FILTER
filter_def.output_flags = obs.OBS_SOURCE_VIDEO

filter_def.get_name = function()
    return "StreamPulse Aspect"
end

filter_def.get_properties = function()
    local props = obs.obs_properties_create()
    obs.obs_properties_add_text(props, "info", "Controlled by StreamPulse OBS Layout & Aspect Studio.", obs.OBS_TEXT_INFO)
    return props
end

filter_def.update = function(data, settings)
    pcall(reload_manifest, true)
end

filter_def.create = function(settings, source)
    local data = {
        context = source,
        base_w = 1920,
        base_h = 1080,
        cur_w = 1920,
        cur_h = 1080,
        cur_ratio = 0,
        cur_pan_x = 0,
        cur_pan_y = 0,
        cur_zoom = 1,
        start_ratio = 0,
        start_pan_x = 0,
        start_pan_y = 0,
        start_zoom = 1,
        tgt_ratio = 0,
        tgt_pan_x = 0,
        tgt_pan_y = 0,
        tgt_zoom = 1,
        morph_t = 1.0,
        morph_dur = 0.0,
        uv_min = obs.vec2(),
        uv_max = obs.vec2()
    }
    obs.obs_enter_graphics()
    data.effect = obs.gs_effect_create(EFFECT_SOURCE, "streampulse_aspect_effect", nil)
    if data.effect ~= nil then
        data.p_uv_min = obs.gs_effect_get_param_by_name(data.effect, "uv_min")
        data.p_uv_max = obs.gs_effect_get_param_by_name(data.effect, "uv_max")
    end
    obs.obs_leave_graphics()
    pcall(reload_manifest, false)
    return data
end

filter_def.destroy = function(data)
    obs.obs_enter_graphics()
    if data.effect ~= nil then
        obs.gs_effect_destroy(data.effect)
        data.effect = nil
    end
    obs.obs_leave_graphics()
end

filter_def.get_width = function(data)
    return math.max(2, math.floor((data.cur_w or 1920) + 0.5))
end

filter_def.get_height = function(data)
    return math.max(2, math.floor((data.cur_h or 1080) + 0.5))
end

filter_def.video_tick = function(data, seconds)
    local target = obs.obs_filter_get_target(data.context) or obs.obs_filter_get_parent(data.context)
    if target == nil then return end
    local bw = obs.obs_source_get_base_width(target)
    local bh = obs.obs_source_get_base_height(target)
    if bw <= 0 or bh <= 0 then return end
    data.base_w = bw
    data.base_h = bh
    local native_ratio = bw / bh

    local parent = obs.obs_filter_get_parent(data.context)
    local sname = (parent and obs.obs_source_get_name(parent)) or obs.obs_source_get_name(target) or ""
    local rule = source_rules[sname]

    local want_ratio = native_ratio
    local want_px = 0
    local want_py = 0
    local want_zoom = 1
    local want_dur = 0
    if rule ~= nil then
        if rule.targetRatio and rule.targetRatio > 0.05 then want_ratio = rule.targetRatio end
        want_px = rule.panX or 0
        want_py = rule.panY or 0
        want_zoom = clamp(rule.zoom or 1, 1, 3)
        want_dur = rule.durationSec or 0
    end

    if data.cur_ratio <= 0.05 then
        data.cur_ratio = want_ratio
        data.cur_pan_x = want_px
        data.cur_pan_y = want_py
        data.cur_zoom = want_zoom
        data.tgt_ratio = want_ratio
        data.tgt_pan_x = want_px
        data.tgt_pan_y = want_py
        data.tgt_zoom = want_zoom
        data.morph_t = 1.0
    elseif math.abs(want_ratio - data.tgt_ratio) > 0.0005
        or math.abs(want_px - data.tgt_pan_x) > 0.05
        or math.abs(want_py - data.tgt_pan_y) > 0.05
        or math.abs(want_zoom - data.tgt_zoom) > 0.002 then
        data.start_ratio = data.cur_ratio
        data.start_pan_x = data.cur_pan_x
        data.start_pan_y = data.cur_pan_y
        data.start_zoom = data.cur_zoom
        data.tgt_ratio = want_ratio
        data.tgt_pan_x = want_px
        data.tgt_pan_y = want_py
        data.tgt_zoom = want_zoom
        data.morph_dur = want_dur
        data.morph_t = (want_dur <= 0.01) and 1.0 or 0.0
    end

    if data.morph_t < 1.0 then
        data.morph_t = math.min(1.0, data.morph_t + (seconds / math.max(0.01, data.morph_dur)))
        local e = ease_in_out_cubic(data.morph_t)
        data.cur_ratio = data.start_ratio + (data.tgt_ratio - data.start_ratio) * e
        data.cur_pan_x = data.start_pan_x + (data.tgt_pan_x - data.start_pan_x) * e
        data.cur_pan_y = data.start_pan_y + (data.tgt_pan_y - data.start_pan_y) * e
        data.cur_zoom  = data.start_zoom  + (data.tgt_zoom  - data.start_zoom)  * e
    else
        data.cur_ratio = data.tgt_ratio
        data.cur_pan_x = data.tgt_pan_x
        data.cur_pan_y = data.tgt_pan_y
        data.cur_zoom  = data.tgt_zoom
    end

    local r = math.max(0.1, data.cur_ratio)
    if r < native_ratio - 0.0005 then
        data.cur_h = bh
        data.cur_w = math.max(2, bh * r)
    elseif r > native_ratio + 0.0005 then
        data.cur_w = bw
        data.cur_h = math.max(2, bw / r)
    else
        data.cur_w = bw
        data.cur_h = bh
    end
end

filter_def.video_render = function(data)
    if data.effect == nil then
        obs.obs_source_skip_video_filter(data.context)
        return
    end
    local out_w = filter_def.get_width(data)
    local out_h = filter_def.get_height(data)
    if not obs.obs_source_process_filter_begin(data.context, obs.GS_RGBA, obs.OBS_NO_DIRECT_RENDERING) then
        return
    end

    local bw = math.max(2, data.base_w or 1920)
    local bh = math.max(2, data.base_h or 1080)
    local zoom = clamp(data.cur_zoom or 1, 1, 3)
    local vis_w = out_w / zoom
    local vis_h = out_h / zoom
    local max_sx = math.max(0, (bw - vis_w) * 0.5)
    local max_sy = math.max(0, (bh - vis_h) * 0.5)
    local cx = bw * 0.5 + ((data.cur_pan_x or 0) / 100.0) * max_sx
    local cy = bh * 0.5 + ((data.cur_pan_y or 0) / 100.0) * max_sy

    obs.vec2_set(data.uv_min, clamp((cx - vis_w * 0.5) / bw, 0.0, 1.0), clamp((cy - vis_h * 0.5) / bh, 0.0, 1.0))
    obs.vec2_set(data.uv_max, clamp((cx + vis_w * 0.5) / bw, 0.0, 1.0), clamp((cy + vis_h * 0.5) / bh, 0.0, 1.0))
    obs.gs_effect_set_vec2(data.p_uv_min, data.uv_min)
    obs.gs_effect_set_vec2(data.p_uv_max, data.uv_max)
    obs.obs_source_process_filter_end(data.context, data.effect, out_w, out_h)
end

function script_description()
    return "StreamPulse OBS Aspect & Frame Filter — smoothly morph aspect ratios, pan, and zoom on any OBS source."
end

function script_load(settings)
    obs.obs_register_source(filter_def)
    pcall(reload_manifest, true)
    obs.timer_add(function()
        pcall(reload_manifest, false)
    end, 350)
end
`;
}

function defaultState() {
    return {
        revision: 1,
        sources: {},
        layouts: []
    };
}

module.exports = function createObsLayoutService({ dataDir, broadcastToOverlays = () => {} } = {}) {
    const stateFile = dataDir ? path.join(dataDir, 'obs-layout.json') : null;
    const assetsDir = dataDir ? path.join(dataDir, 'obs-layout') : null;
    const manifestPath = assetsDir ? path.join(assetsDir, 'manifest.json') : null;
    const luaScriptPath = assetsDir ? path.join(assetsDir, 'streampulse-aspect.lua') : null;

    let state = defaultState();

    function normalizeLayout(raw, idx = 0) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const id = String(src.id || `layout-${crypto.randomBytes(4).toString('hex')}`).trim().replace(/[^a-z0-9_-]/gi, '-').slice(0, 60);
        const items = Array.isArray(src.items)
            ? src.items.slice(0, 80).map(it => ({
                sourceName: String(it?.sourceName || '').trim(),
                transform: it?.transform && typeof it.transform === 'object' ? { ...it.transform } : null,
                visible: it?.visible !== false,
                aspect: it?.aspect ? normalizeAspectConfig(it.aspect) : null
            })).filter(it => it.sourceName)
            : [];
        const cpRaw = src.pathControlPoint && typeof src.pathControlPoint === 'object' ? src.pathControlPoint : null;
        const pathControlPoint = cpRaw && Number.isFinite(Number(cpRaw.x)) && Number.isFinite(Number(cpRaw.y))
            ? { x: Number(cpRaw.x), y: Number(cpRaw.y) }
            : null;
        return {
            id: id || `layout-${idx + 1}`,
            name: String(src.name || `Layout ${idx + 1}`).trim().slice(0, 80) || `Layout ${idx + 1}`,
            sceneName: String(src.sceneName || '').trim().slice(0, 120),
            durationMs: Math.max(0, Math.min(3000, Number(src.durationMs ?? 450) || 0)),
            transitionType: TRANSITION_TYPES.includes(src.transitionType) ? src.transitionType : 'move',
            pathType: PATH_TYPES.includes(src.pathType) ? src.pathType : 'direct',
            pathCurve: Math.max(-1, Math.min(1, Number(src.pathCurve ?? 0.28) || 0)),
            pathControlPoint,
            easing: EASINGS.includes(src.easing) ? src.easing : 'ease-in-out',
            items
        };
    }

    function normalizeState(raw) {
        if (!raw || typeof raw !== 'object') return defaultState();
        const sources = {};
        if (raw.sources && typeof raw.sources === 'object') {
            for (const [name, cfg] of Object.entries(raw.sources)) {
                const clean = String(name || '').trim();
                if (clean) sources[clean] = normalizeAspectConfig(cfg);
            }
        }
        const layouts = Array.isArray(raw.layouts)
            ? raw.layouts.slice(0, 100).map((l, i) => normalizeLayout(l, i))
            : [];
        return {
            revision: Math.max(1, Number(raw.revision) || 1),
            sources,
            layouts
        };
    }

    function syncManifest() {
        if (!manifestPath) return null;
        const manifestSources = {};
        for (const [name, cfg] of Object.entries(state.sources || {})) {
            manifestSources[name] = {
                ratio: cfg.ratio,
                targetRatio: cfg.ratio === 'native' ? 0 : Number(resolveTargetRatio(cfg).toFixed(6)),
                panX: cfg.panX,
                panY: cfg.panY,
                zoom: cfg.zoom,
                durationMs: cfg.durationMs
            };
        }
        const manifest = {
            revision: Math.max(Date.now(), state.revision),
            updatedAt: new Date().toISOString(),
            sources: manifestSources
        };
        writeAtomic(manifestPath, JSON.stringify(manifest, null, 2));
        return manifest;
    }

    function ensureLuaScript() {
        if (!luaScriptPath) return '';
        const expected = buildObsAspectLuaScript({ manifestPath });
        const existing = fs.existsSync(luaScriptPath) ? fs.readFileSync(luaScriptPath, 'utf8') : '';
        if (existing !== expected) {
            writeAtomic(luaScriptPath, expected);
        }
        return expected;
    }

    function loadState() {
        if (stateFile && fs.existsSync(stateFile)) {
            try {
                state = normalizeState(JSON.parse(fs.readFileSync(stateFile, 'utf8')));
            } catch {
                state = defaultState();
            }
        }
        syncManifest();
        ensureLuaScript();
    }

    function persist() {
        state.revision = (Number(state.revision) || 0) + 1;
        if (stateFile) {
            writeAtomic(stateFile, JSON.stringify(state, null, 2));
        }
        syncManifest();
        broadcastToOverlays('obs-layout-update', getPublicState());
    }

    function getPublicState() {
        return {
            ...copy(state),
            manifestPath,
            luaScriptPath
        };
    }

    loadState();

    return {
        ASPECT_PRESETS,
        RESIZE_MODES,
        ANCHORS,
        getState: getPublicState,
        reload: loadState,
        reset() {
            state = defaultState();
            persist();
            return getPublicState();
        },
        setSourceAspect(sourceName, patch = {}) {
            const clean = String(sourceName || '').trim();
            if (!clean) throw new Error('Missing sourceName');
            const prev = state.sources[clean] || normalizeAspectConfig();
            state.sources[clean] = normalizeAspectConfig({ ...prev, ...patch });
            persist();
            return { sourceName: clean, aspect: copy(state.sources[clean]), state: getPublicState() };
        },
        clearSourceAspect(sourceName) {
            const clean = String(sourceName || '').trim();
            if (clean && state.sources[clean]) {
                delete state.sources[clean];
                persist();
            }
            return getPublicState();
        },
        saveLayout(input, idOverride = '') {
            const layout = normalizeLayout({ ...input, ...(idOverride ? { id: idOverride } : {}) }, state.layouts.length);
            const idx = state.layouts.findIndex(l => l.id === layout.id);
            if (idx >= 0) state.layouts[idx] = layout;
            else state.layouts.push(layout);
            persist();
            return { layout: copy(layout), state: getPublicState() };
        },
        deleteLayout(id) {
            const before = state.layouts.length;
            state.layouts = state.layouts.filter(l => l.id !== id);
            if (state.layouts.length === before) {
                const err = new Error('Layout preset not found');
                err.statusCode = 404;
                throw err;
            }
            persist();
            return getPublicState();
        },
        regenerateLuaScript() {
            const lua = buildObsAspectLuaScript({ manifestPath });
            if (luaScriptPath) writeAtomic(luaScriptPath, lua);
            return lua;
        },
        syncManifest
    };
};
