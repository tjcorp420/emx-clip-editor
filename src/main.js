
import './style.css';
import { getStemEngineStatus } from './lib/stems.js';
import { clipDuration, clipAtTime as timelineClipAtTime, magneticStartForClips, timelineStartFromPointer, trimLeftByDelta, trimRightByDelta, splitClipAtTime } from './lib/timelineMath.js';
import { reconcileSelection, selectIds } from './lib/selection.js';
import { normalizeImportInput } from './lib/importInput.js';
import { createPlaybackSession } from './lib/playbackSession.js';
import visualConfig from '../electron/visuals.json';

const app=document.querySelector('#app');
const state={
  media:[],videoClips:[],audioClips:[],overlayClips:[],effectClips:[],selectedMediaId:null,selectedClipId:null,
  selectedMediaIds:new Set(),selectedClipIds:new Set(),mediaSelectionAnchorId:null,clipSelectionAnchorId:null,
  playhead:0,pxPerSec:10,isPlaying:false,timelinePlaying:false,fitTimeline:true,timelinePreview:true,timelineTimer:null,activeTimelineClipId:null,previewRequestId:0,previewMuted:false,scrubbing:false,scrubPreviewTimer:null,renderBusy:false,renderStartedAt:0,lastExportPath:'',
  history:[],future:[],
  branding:{position:'bottom-right',opacity:.78},
  mediaView:'grid',mediaThumbnailSize:132,
  effects:{brightness:0,contrast:1,saturation:1,blur:0},
  export:{crf:20,width:1080,height:1920,fps:60,preset:'veryfast',fit:'contain'},
  settings:{snap:true,previewQuality:'high',defaultVolume:1,autoplayPreview:true,defaultImportFolder:''},
  ffmpegLog:''
};
const uid=()=>crypto.randomUUID?.()||`${Date.now()}_${Math.random().toString(16).slice(2)}`;
const timelinePlaybackSession=createPlaybackSession();

app.innerHTML=`
<div class="app">
<header class="topbar">
  <div class="brand"><img class="logo" src="./emx-logo.png" onerror="this.style.display='none'" alt="EMX"><div><h1>EMX CLIP STUDIO</h1><small id="appVersionLabel">Desktop Timeline Editor • V1.11.2</small></div></div>
  <div class="top-actions">
    <button class="btn undo-last" id="undoLastBtn" disabled>↶ UNDO LAST</button><button class="btn" id="redoBtn" disabled>↷ Redo</button><button class="btn" id="newProject">New</button>
    <button class="btn" id="openFolder">📁 Clips Folder</button>
    <button class="btn" id="importMedia">＋ Import Media</button>
    <button class="btn" id="settingsTop">⚙ Settings</button>
    <button class="btn update-indicator" id="updateIndicator" hidden>UPDATE AVAILABLE</button>
    <button class="btn primary" id="exportBtn">EXPORT MP4</button>
    <input id="filePicker" type="file" accept="video/*,audio/*,image/png,image/jpeg,image/webp,image/gif" multiple hidden>
  </div>
  <div class="top-task" id="topTask" aria-live="polite">
    <span class="top-task-label" id="topTaskLabel">READY</span>
    <div class="top-task-track"><div id="topTaskFill"></div></div>
  </div>
</header>

<main class="workspace">
<section class="panel">
  <div class="panel-title"><span>RESOURCES</span><span id="mediaCount">0</span></div>
  <div class="resource-tabs"><button class="resource-tab active" data-resource="media">Media</button><button class="resource-tab" data-resource="audio">Audio</button></div>
  <div class="media-toolbar">
    <div class="media-filter-row"><button class="btn mini" id="filterAll">All</button><button class="btn mini" id="filterVideo">Video</button><button class="btn mini" id="filterAudio">Audio</button><button class="btn mini" id="filterImage">Image</button></div>
    <input id="mediaSearch" class="media-search" type="search" placeholder="Search media" aria-label="Search media">
    <div class="media-view-row"><button class="btn mini active" id="mediaGrid" title="Grid view">▦</button><button class="btn mini" id="mediaCompact" title="Compact grid view">▦−</button><button class="btn mini" id="mediaListView" title="List view">☷</button><select id="mediaSort" aria-label="Sort media"><option value="date">Newest</option><option value="name">Name</option><option value="duration">Duration</option></select></div>
    <label class="media-size">Thumbnail <input id="mediaThumbSize" type="range" min="100" max="200" step="4" value="132"></label>
    <div class="media-selection-bar" id="mediaSelectionBar" hidden><span id="mediaSelectionCount" title="Use Ctrl/Shift to select multiple media items">0 selected</span><button class="btn mini" id="addSelectedMedia">＋ Add Selected</button><button class="btn mini danger" id="removeSelectedMedia">Remove from Project</button></div>
  </div>
  <div class="media-list" id="mediaList"></div>
</section>

<section class="center">
  <div class="panel preview" id="previewPanel">
    <div class="preview-empty" id="previewEmpty"><b>Drop clips into EMX Clip Studio</b><br>Import video/audio or choose a clips folder.</div>
    <video id="previewVideo" playsinline style="display:none"></video>
    <video id="previewTransitionVideo" playsinline muted style="display:none"></video>
    <audio id="previewAudio" style="display:none"></audio>
    <img id="previewImage" alt="Selected image preview" style="display:none">
    <div id="previewOverlayLayer" class="preview-overlay-layer" aria-hidden="true"></div>
    <div id="previewVignette" class="preview-vignette" aria-hidden="true"></div>
    <div id="audioTimelineVisual" class="audio-timeline-visual" style="display:none">
      <div class="audio-orb">🎵</div>
      <div class="audio-visual-title" id="audioVisualTitle">AUDIO TIMELINE</div>
      <div class="audio-visual-sub" id="audioVisualSub">Previewing extracted/imported audio</div>
      <div class="audio-large-wave" id="audioLargeWave"></div>
    </div>
    <div id="watermarkLayer" class="watermark-layer" style="display:none">
      <img id="watermarkLogoPreview" src="./emx-clips-watermark.png" alt="EMX Clips watermark">
    </div>
    <div class="preview-badge" id="previewBadge">NO MEDIA SELECTED</div><div class="preview-badge timeline-mode" id="timelineModeBadge">TIMELINE PREVIEW</div>
    <div class="preview-toolbar">
      <button class="btn mini" id="previewFullscreen">⛶ Fullscreen</button>
    </div>
  </div>

  <div class="panel transport">
    <button class="btn icon-btn" id="toStart" title="Start">⏮</button>
    <button class="btn icon-btn primary" id="playPause" title="Play / Pause">▶</button>
    <button class="btn icon-btn" id="splitBtn" title="Split selected clip at playhead">✂</button>
    <input id="scrub" type="range" min="0" max="60" step=".01" value="0">
    <span class="time" id="timeReadout">00:00.00 / 00:00.00</span>
    <button class="btn icon-btn" id="muteBtn" title="Mute / Unmute">🔊</button>
    <input id="masterVolume" type="range" min="0" max="1" step=".01" value="1">
  </div>
</section>

<aside class="panel">
  <div class="panel-title"><span>INSPECTOR</span><span id="selectionType">NONE</span></div>
  <div class="inspector-body" id="inspectorBody">
    <div class="tabs">
      <button class="tab active" data-inspector="clip">Clip</button>
      <button class="tab" data-inspector="effects">Effects</button><button class="tab" data-inspector="filters">Filters</button><button class="tab" data-inspector="transitions">Transitions</button>
      <button class="tab" data-inspector="branding">Watermark</button><button class="tab" data-inspector="audio">Audio AI</button>
      <button class="tab" data-inspector="export">Export</button>
      <button class="tab" data-inspector="updates">Updates</button>
      <button class="tab" data-inspector="settings">Settings</button>
    </div>

    <div id="insClip">
      <div id="clipHint" class="status warn" style="margin-bottom:10px">Add a media item to the timeline, then click the timeline clip to edit Trim, Speed and Clip Volume.</div>
      <div class="group"><h3>CLIP TIMING</h3>
        <div class="field"><label>Timeline Start <span id="startVal">—</span></label><input id="clipStart" type="range" min="0" max="60" step=".05" value="0"></div>
        <div class="field"><label>Trim In <span id="trimInVal">—</span></label><input id="trimIn" type="range" min="0" max="10" step=".05" value="0"></div>
        <div class="field"><label>Trim Out <span id="trimOutVal">—</span></label><input id="trimOut" type="range" min=".1" max="10" step=".05" value="10"></div>
        <div class="field"><label>Speed <span id="speedVal">1.00×</span></label><input id="speed" type="range" min=".25" max="4" step=".05" value="1"></div>
        <div class="field"><label>Volume <span id="volumeVal">100%</span></label><input id="volume" type="range" min="0" max="2" step=".01" value="1"></div>
        <div class="field"><label>Audio Fade In <span id="fadeInVal">0.00s</span></label><input id="fadeIn" type="range" min="0" max="5" step=".05" value="0"></div>
        <div class="field"><label>Audio Fade Out <span id="fadeOutVal">0.00s</span></label><input id="fadeOut" type="range" min="0" max="5" step=".05" value="0"></div>
      </div>
      <div class="group" id="videoTransformGroup" hidden><h3>VISUAL FRAMING</h3>
        <div class="status good" id="videoTransformHint">Zoom changes the picture inside the canvas, not the timeline. Pan selects which part remains visible.</div>
        <div class="field"><label>Visual Zoom <span id="clipZoomVal">100%</span></label><input id="clipZoom" type="range" min="1" max="3" step=".01" value="1"></div>
        <div class="field"><label>Pan Left / Right <span id="clipPanXVal">0%</span></label><input id="clipPanX" type="range" min="-1" max="1" step=".01" value="0"></div>
        <div class="field"><label>Pan Up / Down <span id="clipPanYVal">0%</span></label><input id="clipPanY" type="range" min="-1" max="1" step=".01" value="0"></div>
        <button class="btn mini" id="resetClipTransform">Reset Framing</button>
      </div>
      <div class="group"><h3>CLIP ACTIONS</h3><div class="actions"><button class="btn mini" id="duplicateClip">Duplicate</button><button class="btn mini danger" id="deleteClip">Delete</button></div></div>
      <div class="group" id="overlayLayoutGroup" hidden><h3>IMAGE OVERLAY LAYOUT</h3>
        <div class="field"><label>Position</label><select id="overlayPosition"><option value="top-left">Top Left</option><option value="top-center">Top Center</option><option value="top-right">Top Right</option><option value="center-left">Center Left</option><option value="center">Center</option><option value="center-right">Center Right</option><option value="bottom-left">Bottom Left</option><option value="bottom-center">Bottom Center</option><option value="bottom-right">Bottom Right</option></select></div>
        <div class="field"><label>Opacity <span id="overlayOpacityVal">90%</span></label><input id="overlayOpacity" type="range" min=".1" max="1" step=".01" value=".9"></div>
        <div class="field"><label>Scale <span id="overlayScaleVal">28%</span></label><input id="overlayScale" type="range" min=".08" max="1" step=".01" value=".28"></div>
      </div>
      <div class="group" id="transitionGroup" hidden><h3>TRANSITION OUT</h3>
        <div class="field"><label>Style</label><select id="transitionOut"><option value="none">None</option><option value="crossfade">Dissolve</option><option value="dip-black">Dip to Black</option><option value="slide-left">Slide Left</option><option value="slide-right">Slide Right</option></select></div>
        <div class="field"><label>Duration <span id="transitionDurationVal">0.45s</span></label><input id="transitionDuration" type="range" min=".1" max="2" step=".05" value=".45"></div>
        <div class="status" id="transitionHint">Cross Fade overlaps the next video clip and renders the blend in the preview and MP4 export.</div>
      </div>
    </div>

    <div id="insEffects" style="display:none">
      <div class="group visual-library-group"><h3>VIDEO EFFECTS</h3>
        <div id="effectLibraryHint" class="status warn">Add video to the timeline, then click an animated effect or drag it onto the EFFECTS track. Effect clips can be moved, split, and trimmed.</div>
        <input id="effectSearch" class="visual-search" type="search" placeholder="Search effects" aria-label="Search effects">
        <div id="effectLibrary" class="visual-library" aria-live="polite"></div>
      </div>
    </div>

    <div id="insFilters" style="display:none">
      <div class="group visual-library-group"><h3>STATIC FILTERS</h3>
        <div id="filterLibraryHint" class="status warn">Select a video or image overlay on the timeline, then choose a static color filter. Filters are baked into exported MP4s.</div>
        <input id="filterSearch" class="visual-search" type="search" placeholder="Search filters" aria-label="Search filters">
        <div id="filterLibrary" class="visual-library" aria-live="polite"></div>
      </div>
      <div class="group"><h3>FINE-TUNE SELECTED CLIP</h3>
        <div id="clipVisualHint" class="status warn">Select a video or image overlay on the timeline to apply a visual preset or precise adjustments.</div>
        <div class="field"><label>Preset</label><select id="clipVisualPreset"><option value="custom" disabled>Custom adjustments</option><option value="none">None / Reset</option><option value="vivid">Vivid</option><option value="cinematic">Cinematic</option><option value="mono">Monochrome</option><option value="retro">Retro</option><option value="soft">Soft Glow</option></select></div>
        <div class="field"><label>Clip Brightness <span id="clipBrightnessVal">0.00</span></label><input id="clipBrightness" type="range" min="-.5" max=".5" step=".01" value="0"></div>
        <div class="field"><label>Clip Contrast <span id="clipContrastVal">1.00</span></label><input id="clipContrast" type="range" min=".5" max="2" step=".01" value="1"></div>
        <div class="field"><label>Clip Saturation <span id="clipSaturationVal">1.00</span></label><input id="clipSaturation" type="range" min="0" max="2" step=".01" value="1"></div>
        <div class="field"><label>Hue <span id="clipHueVal">0°</span></label><input id="clipHue" type="range" min="-180" max="180" step="1" value="0"></div>
        <div class="field"><label>Soft Blur <span id="clipBlurVal">0.0</span></label><input id="clipBlur" type="range" min="0" max="10" step=".1" value="0"></div>
        <div class="field"><label>Vignette <span id="clipVignetteVal">0%</span></label><input id="clipVignette" type="range" min="0" max="1" step=".01" value="0"></div>
      </div>
      <div class="group"><h3>GLOBAL COLOR ADJUSTMENT</h3>
        <div class="field"><label>Brightness <span id="brightnessVal">0.00</span></label><input id="brightness" type="range" min="-.5" max=".5" step=".01" value="0"></div>
        <div class="field"><label>Contrast <span id="contrastVal">1.00</span></label><input id="contrast" type="range" min=".5" max="2" step=".01" value="1"></div>
        <div class="field"><label>Saturation <span id="saturationVal">1.00</span></label><input id="saturation" type="range" min="0" max="2" step=".01" value="1"></div>
        <div class="field"><label>Blur <span id="blurVal">0</span></label><input id="blur" type="range" min="0" max="10" step=".1" value="0"></div>
      </div>
    </div>

    <div id="insTransitions" style="display:none">
      <div class="group visual-library-group"><h3>TRANSITIONS</h3>
        <div id="transitionLibraryHint" class="status warn">Select one video clip that has another video after it, then choose a transition.</div>
        <input id="transitionSearch" class="visual-search" type="search" placeholder="Search transitions" aria-label="Search transitions">
        <div id="transitionLibrary" class="transition-library" aria-live="polite"></div>
      </div>
    </div>

    
    <div id="insBranding" style="display:none">
      <div class="group"><h3>PERMANENT EMX CLIPS WATERMARK</h3>
        <img class="permanent-watermark-swatch" src="./emx-clips-watermark.png" alt="EMX Clips watermark">
        <div class="status good">EMX Clips Watermark • REQUIRED on preview, timeline playback, and every native export.</div>
        <div class="field"><label>Location</label><select id="watermarkPosition"><option value="top-left">Top Left</option><option value="top-center">Top Center</option><option value="top-right">Top Right</option><option value="center-left">Center Left</option><option value="center">Center</option><option value="center-right">Center Right</option><option value="bottom-left">Bottom Left</option><option value="bottom-center">Bottom Center</option><option value="bottom-right" selected>Bottom Right</option></select></div>
        <div class="field"><label>Opacity <span id="watermarkOpacityVal">78%</span></label><input id="watermarkOpacity" type="range" min=".5" max="1" step=".01" value=".78"></div>
        <div class="status">The asset, colors, design, and production size are locked. Opacity is permanently limited to 50%–100% for clear EMX Clips branding.</div>
      </div>
    </div>

    <div id="insAudio" style="display:none">
      <div class="group"><h3>EMX AUDIO AI ENGINE</h3>
        <div id="aiStatus" class="status warn">EMX is checking the bundled Audio AI runtime automatically...</div>
        <div class="actions">
          <button class="btn mini" id="aiRefreshBtn">↻ Refresh Status</button>
          <button class="btn mini" id="aiRepairBtn">🛠 Repair Audio AI</button>
        </div>
        <div class="status" style="margin-top:8px">Fast Friend build: EMX automatically creates its own private Audio AI runtime when needed. Friends install nothing manually and need no third-party account. Public models download automatically on first use and are cached.</div>
      </div>
      <div class="group"><h3>VOICE / MUSIC / NOISE TOOLS</h3>
        <div class="field"><label>Processing Mode</label>
          <select id="aiMode">
            <option value="remove-voices">Remove Voices — Keep Non-Vocal Audio</option>
            <option value="game-focus">Game Audio Focus — Experimental</option>
            <option value="four-stem">4-Stem Split — Vocals / Drums / Bass / Other</option>
            <option value="denoise">Denoise — Reduce Constant Background Noise</option>
          </select>
        </div>
        <div class="field"><label>After Processing</label>
          <select id="aiAfter">
            <option value="align">Add Result to Timeline at Selected Clip</option>
            <option value="media">Add Result to Media Bin Only</option>
          </select>
        </div>
        <div class="field"><label>Original Clip Audio</label>
          <select id="aiMuteOriginal">
            <option value="on">Mute Original When Result Is Aligned</option>
            <option value="off">Keep Original Audio</option>
          </select>
        </div>
        <button class="btn primary" id="aiProcessBtn">✨ PROCESS SELECTED AUDIO</button>
        <div id="aiModeNote" class="status warn" style="margin-top:8px">Remove Voices uses source separation. Select a video/audio in the Media Bin or a timeline clip.</div>
      </div>
      <div class="group"><h3>QUICK AUDIO</h3>
        <button class="btn" id="extractSelected">Extract Audio From Selected Video</button>
        <div class="status good" style="margin-top:8px">Extracted audio is verified, added to the Media Bin, and can be aligned under clips.</div>
      </div>
      <div class="group"><h3>IMPORTANT</h3>
        <div class="status">Game Audio Focus uses separated stems and a game-focused remix. Because music, voices and game sound effects can already be mixed together in one stereo track, it is intentionally labeled experimental rather than pretending it can perfectly recover game-only sound.</div>
      </div>
    </div>

    <div id="insExport" style="display:none">
      <div class="group"><h3>MP4 EXPORT</h3>
        <div class="field"><label>Resolution</label><select id="exportResolution"><option value="1080x1920">TikTok / Reels 9:16 • 1080×1920</option><option value="1920x1080">Landscape 16:9 • 1920×1080</option><option value="1280x720">Landscape 16:9 • 1280×720</option></select></div>
        <div class="field"><label>Canvas Framing</label><select id="exportFit"><option value="contain">Fit full clip • no surprise cropping</option><option value="cover">Fill canvas • center crop</option></select></div>
        <div class="status">For landscape gameplay on a 9:16 canvas, Fit Full Clip preserves the complete frame with bars. Fill Canvas enlarges and crops the sides. Per-clip Visual Zoom and Pan remain available in the Clip tab.</div>
        <div class="field"><label>Frame Rate</label><select id="exportFps"><option value="60">60 FPS</option><option value="30">30 FPS</option></select></div>
        <div class="field"><label>Quality CRF <span id="crfVal">20</span></label><input id="crf" type="range" min="18" max="32" step="1" value="20"></div>
        <div id="exportEngineStatus" class="status good">Desktop export uses native FFmpeg + FFprobe with output verification.</div>
      </div>
    </div>

    <div id="insUpdates" style="display:none">
      <div class="group"><h3>UPDATE CENTER</h3>
        <div id="updateStatus" class="status warn">Checking update configuration…</div>
        <dl class="update-details"><div><dt>Current Version</dt><dd id="updateCurrentVersion">—</dd></div><div><dt>Latest Version</dt><dd id="updateLatestVersion">—</dd></div><div><dt>Channel</dt><dd id="updateChannel">—</dd></div><div><dt>Last Checked</dt><dd id="updateLastChecked">Never</dd></div><div><dt>Signing</dt><dd id="updateSigning">—</dd></div></dl>
        <div class="progress update-progress"><div id="updateProgress"></div></div><div id="updateProgressText" class="update-progress-text">No download in progress.</div>
        <div class="actions"><button class="btn" id="checkUpdatesBtn">Check for Updates</button><button class="btn" id="downloadUpdateBtn" disabled>Download Update</button><button class="btn primary" id="installUpdateBtn" disabled>Install & Restart</button></div>
        <div id="updateNotes" class="update-notes" hidden></div>
      </div>
    </div>

    <div id="insSettings" style="display:none">
      <div class="group"><h3>EDITOR SETTINGS</h3>
        <div class="field"><label>Preview Quality</label><select id="previewQuality"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
        <div class="field"><label>Default Imported Volume</label><input id="defaultVolume" type="range" min="0" max="1" step=".01" value="1"></div>
        <div class="field"><label>Timeline Snapping</label><select id="snapSetting"><option value="on">Enabled</option><option value="off">Disabled</option></select></div>
        <div class="field"><label>Autoplay Media Bin Preview</label><select id="autoplaySetting"><option value="on">Enabled</option><option value="off">Disabled</option></select></div>
      </div>
      <div class="group"><h3>DESKTOP ENGINE DIAGNOSTICS</h3>
        <div id="engineStatus" class="status warn">Native FFmpeg engine not checked yet.</div>
        <div class="actions"><button class="btn" id="engineSelfTest">Run Engine Self-Test</button></div>
      </div>
      <div class="group"><h3>SHORTCUTS</h3><div class="status">Space = Play/Pause • Ctrl+B or S = Split selected clip • Delete = remove selected clip • Ctrl+Z / Ctrl+Y = Undo / Redo</div></div>
    </div>
  </div>
</aside>
</main>

<section class="timeline-shell">
  <div class="timeline-head">
    <strong>TIMELINE</strong>
    <button class="btn mini" id="undoBtn" disabled>↶ Undo</button>
    <button class="btn mini" id="addVideoTrack">＋ Video Clip</button>
    <button class="btn mini" id="addAudioTrack">＋ Audio Clip</button>
    <button class="btn mini" id="addOverlayTrack">＋ Image Overlay</button>
    <button class="btn mini" id="splitHead">✂ Split</button>
    <button class="btn mini primary" id="fitTimelineBtn">↔ Fit Project</button><button class="btn mini" id="closeGapsBtn">⇥ Close Gaps</button>
    <span class="zoom">Zoom <input id="zoom" type="range" min="4" max="140" step="2" value="10"></span>
  </div>
  <div class="timeline-scroll" id="timelineScroll">
    <div class="timeline-canvas" id="timelineCanvas">
      <div class="ruler" id="ruler"></div>
      <div class="track"><div class="track-label">VIDEO</div><div class="track-lane" id="videoLane"></div></div>
      <div class="track"><div class="track-label">AUDIO</div><div class="track-lane" id="audioLane"></div></div>
      <div class="track overlay-track"><div class="track-label">OVERLAYS</div><div class="track-lane" id="overlayLane"></div></div>
      <div class="track effect-track"><div class="track-label">EFFECTS</div><div class="track-lane" id="effectLane"></div></div>
      <div class="playhead" id="playhead"></div>
    </div>
  </div>
</section>
</div>

<div class="modal-backdrop" id="renderModal">
  <div class="modal render-modal" id="renderModalCard" role="dialog" aria-modal="true" aria-labelledby="renderTitle">
    <div class="render-ambient" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="render-head">
      <div class="render-emblem"><div class="render-spinner" id="renderSpinner"></div><span id="renderCompleteIcon">✓</span></div>
      <div class="render-head-copy"><div class="render-kicker">EMX NATIVE VIDEO ENGINE</div><h2 id="renderTitle">EMX Render Engine</h2><p id="renderStatus">Preparing...</p></div>
    </div>
    <div class="render-progress-row"><span>EXPORT PROGRESS</span><strong class="render-percent" id="renderPercent">0%</strong></div>
    <div class="progress render-progress"><div id="renderProgress"></div></div>
    <div class="render-stages" id="renderStages">
      <span data-stage="prepare" class="active">1 PREPARE</span>
      <span data-stage="process">2 PROCESS</span>
      <span data-stage="verify">3 VERIFY</span>
      <span data-stage="done">4 DONE</span>
    </div>
    <div class="render-meta"><span id="renderElapsed">00:00</span><span id="renderHint">Keep EMX Clip Studio open while this finishes.</span></div>
    <div class="status render-log" id="renderLog"></div>
    <div class="render-result" id="renderResult" hidden>
      <div class="render-result-icon">✓</div>
      <div class="render-result-copy"><b id="renderOutputName">Export complete</b><span id="renderOutputPath"></span><small id="renderOutputMeta"></small></div>
    </div>
    <div class="actions render-actions"><button class="btn primary" id="openExportVideo" hidden>▶ Play Export</button><button class="btn" id="openExportFolder" hidden>▣ Open Export Folder</button><button class="btn" id="closeRender">Close</button></div>
  </div>
</div>
<div class="modal-backdrop" id="folderModeModal" role="dialog" aria-modal="true" aria-labelledby="folderModeTitle">
  <div class="modal folder-mode-modal">
    <h2 id="folderModeTitle">Use this clips folder</h2>
    <p id="folderModePath">Choose how EMX Clip Studio should use the selected folder.</p>
    <div class="folder-mode-actions">
      <button class="btn primary" id="folderImportAll">Import All Clips</button>
      <button class="btn" id="folderSetDefault">Set as Default Import Folder</button>
    </div>
    <div class="status">Import All adds supported files directly in this folder to Resources. Set as Default Import Folder imports nothing now; Import Media will open there so you can choose specific files.</div>
    <div class="actions"><button class="btn" id="folderModeCancel">Cancel</button></div>
  </div>
</div>
<div class="clip-context" id="clipContext">
  <div class="context-title">CLIP ACTIONS</div>
  <button data-action="split">✂ Split at Playhead</button>
  <button data-action="trim-start">Trim Start to Playhead</button>
  <button data-action="trim-end">Trim End to Playhead</button>
  <button data-action="freeze">❄ Freeze Frame at Playhead</button>
  <button data-action="move-playhead">↦ Move Clip to Playhead</button>
  <button data-action="duplicate">Duplicate</button>
  <button data-action="separate">🎵 Separate Audio to Track</button>
  <button data-action="mute">🔇 Mute / Unmute Clip</button>
  <div class="context-separator"></div>
  <button data-action="delete" class="danger-item">🗑 DELETE CLIP</button>
</div>
<div class="clip-context media-context" id="mediaContext">
  <div class="context-title">MEDIA ACTIONS</div>
  <button data-media-action="preview">▶ Preview</button>
  <button data-media-action="add">＋ Add to Timeline</button>
  <button data-media-action="extract" data-video-only>🎵 Extract / Separate Audio</button>
  <button data-media-action="rename">✎ Rename Display Label</button>
  <button data-media-action="reveal">▣ Reveal in Explorer</button>
  <button data-media-action="info">ⓘ File Information</button>
  <div class="context-separator"></div>
  <button data-media-action="remove" class="danger-item">🗑 REMOVE FROM PROJECT</button>
</div>
<div class="toast" id="toast" aria-live="polite">
  <div class="toast-icon" id="toastIcon">⚡</div>
  <div class="toast-copy"><b id="toastTitle">EMX</b><span id="toastMessage"></span></div>
</div>
`;

const $=id=>document.getElementById(id);
const toast=$('toast');
const v=$('previewVideo'),transitionVideo=$('previewTransitionVideo'),a=$('previewAudio'),previewImage=$('previewImage');

function notify(msg,type='info',title='EMX Clip Studio'){
  const icons={info:'⚡',success:'✓',error:'✕',warn:'!',loading:'◌'};
  toast.className=`toast ${type}`;
  $('toastIcon').textContent=icons[type]||'⚡';
  $('toastTitle').textContent=title;
  $('toastMessage').textContent=msg;
  toast.classList.add('show');
  clearTimeout(notify.t);
  notify.t=setTimeout(()=>toast.classList.remove('show'),type==='error'?4200:2600);
}
function setTopTask(label,progress=null,stateName='working'){
  const task=$('topTask'),fill=$('topTaskFill');
  task.className=`top-task ${stateName}`;
  $('topTaskLabel').textContent=label||'READY';
  if(progress===null){
    fill.classList.add('indeterminate');
    fill.style.width='34%';
  }else{
    fill.classList.remove('indeterminate');
    fill.style.width=`${Math.max(0,Math.min(100,progress*100))}%`;
  }
  if(stateName==='done'||stateName==='error'){
    setTimeout(()=>{task.className='top-task';$('topTaskLabel').textContent='READY';fill.style.width='0%';},1800);
  }
}
function setButtonBusy(button,busy,label='WORKING...'){
  if(!button)return;
  if(busy){
    if(!button.dataset.originalText)button.dataset.originalText=button.textContent;
    button.disabled=true;button.classList.add('busy');button.textContent=label;
  }else{
    button.disabled=false;button.classList.remove('busy');
    if(button.dataset.originalText){button.textContent=button.dataset.originalText;delete button.dataset.originalText}
  }
}
function fmt(s){s=Math.max(0,Number(s)||0);const m=Math.floor(s/60),sec=(s%60).toFixed(2).padStart(5,'0');return `${String(m).padStart(2,'0')}:${sec}`}

async function probeMedia(source,mime){
  if(String(mime||'').startsWith('image/')){
    return new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>resolve(5);
      image.onerror=()=>resolve(5);
      image.src=source;
    });
  }
  return new Promise(resolve=>{
    const el=document.createElement(String(mime||'').startsWith('audio')?'audio':'video');
    el.preload='metadata';
    el.onloadedmetadata=()=>{const d=Number.isFinite(el.duration)?el.duration:10;resolve(d)};
    el.onerror=()=>resolve(10);
    el.src=source;
  });
}

async function makeThumbnail(source,mime,duration){
  if(String(mime||'').startsWith('image/')) return source;
  if(!String(mime||'').startsWith('video/')) return null;
  return new Promise(resolve=>{
    const vid=document.createElement('video');vid.muted=true;vid.playsInline=true;vid.preload='metadata';vid.crossOrigin='anonymous';
    vid.onloadedmetadata=()=>{vid.currentTime=Math.min(Math.max(.25,duration*.08),Math.max(.25,duration-.1))};
    vid.onseeked=()=>{
      const c=document.createElement('canvas');c.width=320;c.height=180;
      const ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,320,180);
      const scale=Math.min(320/vid.videoWidth,180/vid.videoHeight);
      const w=vid.videoWidth*scale,h=vid.videoHeight*scale;
      ctx.drawImage(vid,(320-w)/2,(180-h)/2,w,h);
      resolve(c.toDataURL('image/jpeg',.80));
    };
    vid.onerror=()=>resolve(null);
    vid.src=source;
  });
}


async function makeWaveform(file){
  if(!file||!String(file.type||'').startsWith('audio/')||typeof file.arrayBuffer!=='function')return null;
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return null;
    const ctx=new Ctx();
    const buf=await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
    const channel=buf.getChannelData(0);
    const bins=120,step=Math.max(1,Math.floor(channel.length/bins)),values=[];
    for(let i=0;i<bins;i++){
      let peak=0;
      const start=i*step,end=Math.min(channel.length,start+step);
      for(let j=start;j<end;j++)peak=Math.max(peak,Math.abs(channel[j]));
      values.push(Math.max(.04,peak));
    }
    try{await ctx.close()}catch{}
    return values;
  }catch{return null}
}

function waveformSvg(values,color='#39ff14'){
  if(!values?.length)return '';
  const w=600,h=90,mid=h/2,barW=w/values.length;
  const bars=values.map((v,i)=>{
    const bh=Math.max(3,v*(h-10));
    return `<rect x="${(i*barW).toFixed(2)}" y="${(mid-bh/2).toFixed(2)}" width="${Math.max(1,barW*.64).toFixed(2)}" height="${bh.toFixed(2)}" rx="1"/>`;
  }).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><g fill="${color}">${bars}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function mediaKind(mime,name=''){
  if(String(mime||'').startsWith('image/')||/\.(png|jpe?g|webp|gif)$/i.test(name))return 'image';
  if(String(mime||'').startsWith('audio/'))return 'audio';
  if(String(mime||'').startsWith('video/'))return 'video';
  return /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(name)?'audio':'video';
}

const defaultClipVisual=Object.freeze({...visualConfig.defaultClipVisual});
const defaultOverlay=Object.freeze({...visualConfig.defaultOverlay});
function bounded(value,minimum,maximum,fallback){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(minimum,Math.min(maximum,n)):fallback;
}
function normalizeClipVisual(visual={}){
  return {
    brightness:bounded(visual.brightness,-.5,.5,defaultClipVisual.brightness),
    contrast:bounded(visual.contrast,.5,2,defaultClipVisual.contrast),
    saturation:bounded(visual.saturation,0,2,defaultClipVisual.saturation),
    blur:bounded(visual.blur,0,10,defaultClipVisual.blur),
    hue:bounded(visual.hue,-180,180,defaultClipVisual.hue),
    vignette:bounded(visual.vignette,0,1,defaultClipVisual.vignette),
    zoom:bounded(visual.zoom,1,3,defaultClipVisual.zoom),
    panX:bounded(visual.panX,-1,1,defaultClipVisual.panX),
    panY:bounded(visual.panY,-1,1,defaultClipVisual.panY)
  };
}
function clipVisual(clip){return normalizeClipVisual(clip?.visual)}
function trackAcceptsMedia(track,media){return track==='overlay'?media?.type==='image':media?.type===track}
function clipCollectionForType(type){return type==='audio'?state.audioClips:type==='overlay'?state.overlayClips:type==='effect'?state.effectClips:state.videoClips}
function allTimelineClips(){return [...state.videoClips,...state.audioClips,...state.overlayClips,...state.effectClips]}

async function addMediaItems(items){
  let count=0,added=[];
  setTopTask('IMPORTING MEDIA…',null,'working');
  for(const item of items){
    const imported=normalizeImportInput(item,candidate=>typeof File!=='undefined'&&candidate instanceof File);
    const {file,mime,name,nativePath,mediaToken,url:trustedUrl}=imported;
    const type=mediaKind(mime,name);
    if(!file&&!trustedUrl)continue;
    if(!['video','audio','image'].includes(type))continue;
    const url=trustedUrl||URL.createObjectURL(file);
    const duration=await probeMedia(url,mime),thumb=await makeThumbnail(url,mime,duration),waveform=file?await makeWaveform(file):null;
    let resolvedNativePath=nativePath;
    if(!nativePath&&window.emxDesktop?.available){
      try{resolvedNativePath=window.emxDesktop.getPathForFile(file)||''}catch{}
    }
    state.media.push({
      id:uid(),file,nativePath:resolvedNativePath,name,
      type,duration,url,mediaToken,revokeUrl:!trustedUrl,thumb,waveform,addedAt:Date.now()
    });
    added.push(state.media.at(-1));
    count++;
  }
  renderMedia();
  setTopTask(`${count} MEDIA FILE(S) READY`,1,'done');
  notify(`${count} media file(s) imported`,'success');
  return added;
}

async function addFiles(items){return addMediaItems(items)}

let mediaFilter='all';
let mediaSearch='';
let mediaSort='date';
function visibleMedia(){
  const normalizedSearch=mediaSearch.trim().toLocaleLowerCase();
  return state.media
    .filter(m=>(mediaFilter==='all'||m.type===mediaFilter)&&(!normalizedSearch||m.name.toLocaleLowerCase().includes(normalizedSearch)))
    .sort((left,right)=>{
      if(mediaSort==='name')return left.name.localeCompare(right.name,undefined,{numeric:true,sensitivity:'base'});
      if(mediaSort==='duration')return right.duration-left.duration||left.name.localeCompare(right.name);
      return (right.addedAt||0)-(left.addedAt||0);
    });
}

function orderedMediaIds(){return state.media.map(media=>media.id)}
function orderedTimelineClipIds(){
  return allTimelineClips()
    .sort((left,right)=>left.start-right.start||left.type.localeCompare(right.type)||left.id.localeCompare(right.id))
    .map(clip=>clip.id);
}
function selectedMediaItems(){
  state.selectedMediaIds=reconcileSelection(state.selectedMediaIds,orderedMediaIds());
  return state.media.filter(media=>state.selectedMediaIds.has(media.id));
}
function selectedTimelineClips(){
  state.selectedClipIds=reconcileSelection(state.selectedClipIds,orderedTimelineClipIds());
  return allTimelineClips().filter(clip=>state.selectedClipIds.has(clip.id));
}
function reconcileActiveSelections(){
  const media=selectedMediaItems();
  const clips=selectedTimelineClips();
  if(!state.selectedMediaIds.has(state.selectedMediaId))state.selectedMediaId=media.at(-1)?.id||null;
  if(!state.selectedClipIds.has(state.selectedClipId))state.selectedClipId=clips.at(-1)?.id||null;
  if(state.selectedMediaId&&!state.selectedMediaIds.has(state.selectedMediaId))state.selectedMediaIds.add(state.selectedMediaId);
  if(state.selectedClipId&&!state.selectedClipIds.has(state.selectedClipId))state.selectedClipIds.add(state.selectedClipId);
}
function modifierSelection(event){return {toggle:Boolean(event?.ctrlKey||event?.metaKey),range:Boolean(event?.shiftKey)}}
function setMediaSelection(id,options={}){
  const next=selectIds({
    currentIds:state.selectedMediaIds,orderedIds:orderedMediaIds(),targetId:id,
    anchorId:state.mediaSelectionAnchorId,...options
  });
  state.selectedMediaIds=next.ids;
  state.mediaSelectionAnchorId=next.anchorId;
  state.selectedMediaId=state.selectedMediaIds.has(id)?id:[...state.selectedMediaIds].at(-1)||null;
  updateMediaSelectionBar();
}
function setClipSelection(id,options={}){
  const next=selectIds({
    currentIds:state.selectedClipIds,orderedIds:orderedTimelineClipIds(),targetId:id,
    anchorId:state.clipSelectionAnchorId,...options
  });
  state.selectedClipIds=next.ids;
  state.clipSelectionAnchorId=next.anchorId;
  state.selectedClipId=state.selectedClipIds.has(id)?id:[...state.selectedClipIds].at(-1)||null;
}
function updateMediaSelectionBar(){
  const count=selectedMediaItems().length;
  $('mediaSelectionBar').hidden=count===0;
  $('mediaSelectionCount').textContent=`${count} selected`;
  $('addSelectedMedia').disabled=count===0;
  $('removeSelectedMedia').disabled=count===0;
}
function renderMedia(){
  const list=$('mediaList');
  $('mediaCount').textContent=state.media.length;
  list.className=`media-list ${state.mediaView}`;
  list.style.setProperty('--media-thumb-size',`${state.mediaThumbnailSize}px`);
  list.innerHTML='';
  visibleMedia().forEach(m=>{
    const d=document.createElement('article');d.className='media-item'+(state.selectedMediaIds.has(m.id)?' selected':'');
    d.draggable=true;
    d.dataset.mediaId=m.id;
    d.dataset.mediaType=m.type;
    d.title='Drag this media directly onto the matching timeline track. Double-click to preview.';
    const visual=(m.type==='video'||m.type==='image')&&m.thumb?`<img src="${m.thumb}" alt="">`:m.waveform?`<div class="audio-thumb waveform-thumb" style="background-image:url('${waveformSvg(m.waveform)}')"></div>`:`<div class="audio-thumb">🎵</div>`;
    d.innerHTML=`
      <div class="thumb-wrap">${visual}<div class="media-overlay"><button class="btn mini" data-preview="${m.id}" title="Preview">▶</button><button class="btn mini" data-add="${m.id}" data-track="${m.type}" title="Add to timeline">＋</button><button class="btn mini" data-menu="${m.id}" title="More actions">•••</button></div></div>
      <div class="media-copy"><div class="media-name">${m.type==='video'?'🎬':m.type==='image'?'🖼️':'🎵'} ${m.name}</div><div class="media-meta">${m.type.toUpperCase()} • ${m.type==='image'?'5.00s overlay default':fmt(m.duration)}</div></div>`;
    list.appendChild(d);
    d.addEventListener('dragstart',ev=>{
      ev.dataTransfer.effectAllowed='copy';
      ev.dataTransfer.setData('application/x-emx-media-id',m.id);
      ev.dataTransfer.setData('application/x-emx-media-type',m.type);
      ev.dataTransfer.setData('text/plain',m.id);
      d.classList.add('dragging');
    });
    d.addEventListener('dragend',()=>d.classList.remove('dragging'));
    d.addEventListener('contextmenu',event=>{
      event.preventDefault();
      if(!state.selectedMediaIds.has(m.id)){
        setMediaSelection(m.id);
        renderMedia();
        updateInspector();
      }
      showMediaContext(m,event.clientX,event.clientY);
    });
  });
  updateMediaSelectionBar();
}


function captureEditState(){
  return {
    videoClips:state.videoClips.map(c=>({...c})),
    audioClips:state.audioClips.map(c=>({...c})),
    overlayClips:state.overlayClips.map(c=>({...c,visual:{...clipVisual(c)}})),
    effectClips:state.effectClips.map(c=>({...c})),
    effects:{...state.effects},
    branding:{...state.branding}
  };
}
function updateHistoryButtons(){
  $('undoBtn').disabled=!state.history.length;
  $('undoLastBtn').disabled=!state.history.length;
  $('redoBtn').disabled=!state.future.length;
}
function pushHistory(label){
  state.history.push({label,snapshot:captureEditState()});
  if(state.history.length>40)state.history.shift();
  state.future=[];
  updateHistoryButtons();
}
function restoreEditState(snapshot){
  stopTimelinePlayback();
  state.videoClips=snapshot.videoClips.map(c=>({...c}));
  state.audioClips=snapshot.audioClips.map(c=>({...c}));
  state.overlayClips=(snapshot.overlayClips||[]).map(c=>({...c,visual:clipVisual(c)}));
  state.effectClips=(snapshot.effectClips||[]).map(c=>({...c}));
  state.effects={...snapshot.effects};
  state.branding={...snapshot.branding};
  state.selectedClipId=null;state.selectedClipIds=new Set();state.clipSelectionAnchorId=null;
  state.playhead=Math.min(state.playhead,projectEnd());
  renderTimeline();
  updateInspector();
  updateWatermarkPreview();
  previewTimelineAt(state.playhead,false);
}
function undo(){
  if(!state.history.length)return;
  const entry=state.history.pop();
  state.future.push({label:entry.label,snapshot:captureEditState()});
  restoreEditState(entry.snapshot);
  updateHistoryButtons();
  notify(`Undo: ${entry.label}`);
}
function redo(){
  if(!state.future.length)return;
  const entry=state.future.pop();
  state.history.push({label:entry.label,snapshot:captureEditState()});
  restoreEditState(entry.snapshot);
  updateHistoryButtons();
  notify(`Redo: ${entry.label}`);
}
$('undoBtn').onclick=undo;
$('undoLastBtn').onclick=undo;
$('redoBtn').onclick=redo;

function activePreview(){return v.style.display!=='none'?v:a}
function mediaErrorMessage(el){
  const code=Number(el?.error?.code||0);
  return ({1:'The media load was aborted.',2:'The media file could not be reached.',3:'The media file could not be decoded.',4:'This media format is not supported by the preview engine.'})[code]||'The preview did not become ready in time.';
}
function waitForPreviewReady(el,timeoutMs=7000){
  return new Promise((resolve,reject)=>{
    if(el.readyState>=HTMLMediaElement.HAVE_FUTURE_DATA)return resolve();
    let timer;
    const cleanup=()=>{
      clearTimeout(timer);
      el.removeEventListener('canplay',ready);
      el.removeEventListener('loadeddata',ready);
      el.removeEventListener('error',failed);
    };
    const ready=()=>{cleanup();resolve()};
    const failed=()=>{cleanup();reject(new Error(mediaErrorMessage(el)))};
    el.addEventListener('canplay',ready,{once:true});
    el.addEventListener('loadeddata',ready,{once:true});
    el.addEventListener('error',failed,{once:true});
    timer=setTimeout(()=>{cleanup();reject(new Error(mediaErrorMessage(el)))},timeoutMs);
  });
}
async function selectMedia(id,autoplay=true,selectionOptions={}){
  stopTimelinePlayback();
  const requestId=++state.previewRequestId;
  setMediaSelection(id,selectionOptions);state.timelinePreview=false;state.activeTimelineClipId=null;$('timelineModeBadge').style.display='none';renderMedia();updateInspector();
  const m=state.media.find(x=>x.id===id);if(!m)return;
  v.pause();transitionVideo.pause();a.pause();v.style.display='none';transitionVideo.style.display='none';a.style.display='none';previewImage.style.display='none';$('previewEmpty').style.display='none';
  if(m.type==='image'){
    previewImage.src=m.url;previewImage.style.display='block';previewImage.style.filter='none';
    $('previewBadge').textContent=m.name;
    $('scrub').max=m.duration||5;$('scrub').value=0;$('timeReadout').textContent=`00:00.00 / ${fmt(m.duration||5)}`;
    updateOverlayPreview();
    return;
  }
  const el=m.type==='video'?v:a;el.src=m.url;el.load();el.style.display='block';el.volume=+$('masterVolume').value;
  $('previewBadge').textContent=m.name;
  const onMeta=()=>{
    $('scrub').max=Number.isFinite(el.duration)?el.duration:m.duration;
    updateTransport();
  };
  el.onloadedmetadata=onMeta;
  try{
    await waitForPreviewReady(el);
    if(requestId!==state.previewRequestId||state.timelinePreview||state.selectedMediaId!==id||el.src!==m.url)return;
    onMeta();
    if(m.type==='video'&&!m.thumb){
      const thumbnail=await makeThumbnail(m.url,m.mime,m.duration);
      if(thumbnail&&state.media.find(item=>item.id===m.id)===m){m.thumb=thumbnail;renderMedia()}
    }
  }catch(error){
    if(requestId===state.previewRequestId&&!state.timelinePreview&&state.selectedMediaId===id)notify(`Preview unavailable: ${error?.message||error}`,'error','Media Preview Failed');
    return;
  }
  if(requestId!==state.previewRequestId||state.timelinePreview)return;
  if(autoplay&&state.settings.autoplayPreview){
    try{
      await el.play();
      if(requestId!==state.previewRequestId||state.timelinePreview){
        if(!state.timelinePlaying)el.pause();
        return;
      }
      state.isPlaying=true;
      $('playPause').textContent='⏸';
    }catch(err){
      if(requestId===state.previewRequestId&&!state.timelinePreview){
        state.isPlaying=false;
        $('playPause').textContent='▶';
        notify('Clip loaded. Press Play if browser autoplay is blocked.');
      }
    }
  }
}

function updateTransport(){
  if(state.scrubbing)return;
  if(state.timelinePreview&&hasTimeline()){
    updateTimelineTimeReadout();
    return;
  }
  const el=activePreview();
  if(!el||el.style.display==='none'){
    $('timeReadout').textContent=`${fmt(state.playhead)} / 00:00.00`;
    return;
  }
  $('scrub').max=Number.isFinite(el.duration)?el.duration:60;
  $('scrub').value=el.currentTime||0;
  $('timeReadout').textContent=`${fmt(el.currentTime)} / ${fmt(el.duration)}`;
  state.playhead=el.currentTime||state.playhead;
  renderPlayhead();
}
[v,a].forEach(el=>{
  el.addEventListener('timeupdate',updateTransport);
  el.addEventListener('play',()=>{if(!state.timelinePreview){state.isPlaying=true;$('playPause').textContent='⏸'}});
  el.addEventListener('pause',()=>{if(!state.timelinePreview){state.isPlaying=false;$('playPause').textContent='▶'}});
  el.addEventListener('ended',()=>{if(!state.timelinePreview){state.isPlaying=false;$('playPause').textContent='▶'}});
});

function makeTimelineClip(media,track,start){
  const isOverlay=track==='overlay';
  const duration=isOverlay?5:media.duration;
  return {
    id:uid(),mediaId:media.id,file:media.file,nativePath:media.nativePath||'',name:media.name,type:track,sourceType:media.type,
    start,trimStart:0,trimEnd:duration,speed:1,volume:state.settings.defaultVolume,fadeIn:0,fadeOut:0,duration,thumb:media.thumb,waveform:media.waveform,
    visual:{...defaultClipVisual},opacity:isOverlay?defaultOverlay.opacity:1,scale:isOverlay?defaultOverlay.scale:1,
    position:isOverlay?defaultOverlay.position:'center',transitionOut:'none',transitionDuration:.45,transitionIn:0,transitionInStyle:'none'
  };
}
function addMediaItemsToTimeline(mediaItems,forcedTrack=null,explicitStart=null){
  const items=(mediaItems||[]).filter(media=>media&&(forcedTrack?trackAcceptsMedia(forcedTrack,media):['video','audio','image'].includes(media.type)));
  if(!items.length)return notify(forcedTrack?`Select ${forcedTrack} media first.`:'Select one or more media items first.','warn');
  pushHistory(items.length===1?`Add ${forcedTrack||items[0].type} clip`:`Add ${items.length} selected clips`);
  stopTimelinePlayback();
  const created=[];
  for(const track of ['video','audio','overlay']){
    const trackItems=items.filter(media=>trackAcceptsMedia(track,media));
    if(!trackItems.length)continue;
    const arr=clipCollectionForType(track);
    let cursor=0;
    if(explicitStart!==null&&Number.isFinite(explicitStart)&&trackItems.length===1){
      cursor=Math.max(0,explicitStart);
    }else if(arr.length){
      const last=arr.slice().sort((left,right)=>left.start-right.start).at(-1);
      cursor=last.start+clipTimelineDuration(last);
    }
    for(const media of trackItems){
      const clip=makeTimelineClip(media,track,cursor);
      arr.push(clip);created.push(clip);
      cursor+=clipTimelineDuration(clip);
    }
    arr.sort((left,right)=>left.start-right.start);
  }
  if(!created.length)return;
  state.selectedClipIds=new Set(created.map(clip=>clip.id));state.selectedClipId=created.at(-1).id;state.clipSelectionAnchorId=state.selectedClipId;
  state.timelinePreview=true;
  renderTimeline();
  updateInspector();
  previewTimelineAt(Math.min(...created.map(clip=>clip.start)),false);
  requestAnimationFrame(()=>fitTimelineIfNeeded());
}
function addClip(mediaId,track,explicitStart=null){
  const media=state.media.find(item=>item.id===mediaId);
  if(media)addMediaItemsToTimeline([media],track,explicitStart);
}
function addSelectedMediaToTimeline(){addMediaItemsToTimeline(selectedMediaItems())}
function findClip(id){return allTimelineClips().find(c=>c.id===id)}
function clipTimelineDuration(c){return clipDuration(c)}
function selectClip(id,selectionOptions={}){
  setClipSelection(id,selectionOptions);
  document.querySelectorAll('.clip').forEach(el=>el.classList.toggle('selected',state.selectedClipIds.has(el.dataset.clip)));
  updateInspector();
}
function activateTimelinePreviewForClip(clip){
  if(state.timelinePreview||!clip)return;
  const clipEnd=clip.start+clipTimelineDuration(clip);
  const target=state.playhead>=clip.start&&state.playhead<clipEnd?state.playhead:clip.start;
  stopTimelinePlayback();
  previewTimelineAt(Math.min(projectEnd(),target),false);
}

function projectEnd(){
  return Math.max(
    0,
    ...state.videoClips.map(c=>c.start+clipTimelineDuration(c)),
    ...state.audioClips.map(c=>c.start+clipTimelineDuration(c)),
    ...state.overlayClips.map(c=>c.start+clipTimelineDuration(c))
  );
}

function fittedHorizon(){
  const end=Math.max(0,projectEnd());
  return Math.max(120,end+Math.max(45,end*.45));
}

function fitTimelineIfNeeded(){
  if(!state.fitTimeline)return;
  const lane=$('videoLane');
  if(!lane)return;
  const horizon=fittedHorizon();
  const usable=Math.max(600,lane.clientWidth||900);
  state.pxPerSec=Math.max(6,Math.min(140,(usable-12)/horizon));
  $('zoom').value=Math.max(30,Math.min(140,state.pxPerSec));
  renderTimeline(false);
}

function renderRuler(){
  const end=projectEnd();
  const total=state.fitTimeline?fittedHorizon():Math.max(90,end+20);
  const visibleWidth=Math.max(700,$('timelineScroll').clientWidth-90);
  const desiredWidth=Math.max(visibleWidth,total*state.pxPerSec);
  $('timelineCanvas').style.width=`${desiredWidth+90}px`;
  $('ruler').innerHTML='';

  let step=5;
  if(total<=30)step=2;
  else if(total>240)step=30;
  else if(total>120)step=15;
  else if(total>90)step=10;

  for(let t=0;t<=Math.ceil(total);t+=step){
    const s=document.createElement('span');
    s.className='tick';
    s.style.left=`${t*state.pxPerSec}px`;
    s.textContent=`${t}s`;
    $('ruler').appendChild(s);
  }
}

function magneticStart(candidate,movingClip,trackClips){
  return magneticStartForClips(candidate,movingClip,trackClips,state.settings.snap,state.pxPerSec);
}

function effectDefinition(id){return (visualConfig.effectLibrary||[]).find(item=>item.id===id)||null}
function effectClipLabel(clip){return effectDefinition(clip.effectId)?.title||clip.name||'Animated Effect'}
function timelineClipWidth(clip){return Math.max(24,clipTimelineDuration(clip)*state.pxPerSec)}

function renderLane(lane,clips,trackType='video'){
  const audio=trackType==='audio';
  const overlay=trackType==='overlay';
  const effect=trackType==='effect';
  lane.innerHTML='';
  clips.forEach(c=>{
    const d=document.createElement('div');d.className=`clip ${audio?'audio':''} ${overlay?'overlay':''} ${effect?'effect':''} ${state.selectedClipIds.has(c.id)?'selected':''}`;d.dataset.clip=c.id;
    d.style.left=`${c.start*state.pxPerSec}px`;d.style.width=`${timelineClipWidth(c)}px`;
    const bg=effect?'':audio&&c.waveform?waveformSvg(c.waveform):c.thumb;
    const transition=c.transitionOut&&c.transitionOut!=='none'?` • ◇ ${transitionLabel(c.transitionOut)} ${Number(c.transitionDuration||.45).toFixed(2)}s`:'';
    const title=effect?`✦ ${effectClipLabel(c)}`:`${c.isFreeze?'❄ ':overlay?'🖼️ ':''}${c.name}`;
    const subtitle=effect?`${fmt(clipTimelineDuration(c))} • ANIMATED`: `${fmt(c.trimStart)} → ${fmt(c.trimEnd)}${overlay?` • ${Math.round((c.opacity??1)*100)}%`: ` • ${Number(c.speed||1).toFixed(2)}×${transition}`}`;
    d.innerHTML=`<div class="clip-bg" ${bg?`style="background-image:url('${bg}')"`:''}></div><div class="clip-shade"></div><div class="trim-handle left" title="Drag left/right to trim start"><span>‹</span></div><div class="trim-handle right" title="Drag left/right to trim end"><span>›</span></div><div class="clip-title">${title}</div><div class="clip-sub">${subtitle}</div>`;
    lane.appendChild(d);
    let sx=0,dragPointerOffset=0,dragMoved=false;
    d.addEventListener('pointerdown',e=>{
      if(e.button!==0||e.target.closest('.trim-handle'))return;
      e.preventDefault();
      const modifiers=modifierSelection(e);
      selectClip(c.id,modifiers);
      if(modifiers.toggle||modifiers.range)return;
      activateTimelinePreviewForClip(c);
      const rect=lane.getBoundingClientRect();
      sx=e.clientX;
      dragPointerOffset=(e.clientX-rect.left)/Math.max(1,state.pxPerSec)-c.start;
      d.setPointerCapture(e.pointerId);
    });
    d.addEventListener('pointermove',e=>{
      if(!d.hasPointerCapture(e.pointerId))return;
      if(!dragMoved&&Math.abs(e.clientX-sx)<2)return;
      if(!dragMoved){
        dragMoved=true;
        pushHistory('Move clip');
        state.fitTimeline=false;$('fitTimelineBtn').classList.remove('primary');
      }
      const rect=lane.getBoundingClientRect();
      let next=timelineStartFromPointer(e.clientX,rect.left,state.pxPerSec,dragPointerOffset);
      next=magneticStart(next,c,clips);
      c.start=Math.max(0,next);
      d.style.left=`${c.start*state.pxPerSec}px`;
      if(state.selectedClipIds.has(c.id))updateInspector();
    });
    d.addEventListener('pointerup',e=>{
      if(!d.hasPointerCapture(e.pointerId))return;
      try{d.releasePointerCapture(e.pointerId)}catch{}
      if(dragMoved){
        const arr=clipCollectionForType(trackType);
        arr.sort((a,b)=>a.start-b.start);
        renderTimeline();
        previewTimelineAt(state.playhead,false);
      }
      dragMoved=false;
    });
    d.addEventListener('pointercancel',()=>{dragMoved=false});
    const leftHandle=d.querySelector('.trim-handle.left');
    const rightHandle=d.querySelector('.trim-handle.right');

    function updateClipGeometry(){
      d.style.left=`${c.start*state.pxPerSec}px`;
      d.style.width=`${timelineClipWidth(c)}px`;
      const sub=d.querySelector('.clip-sub');
      if(sub)sub.textContent=effect?`${fmt(clipTimelineDuration(c))} • ANIMATED`:`${fmt(c.trimStart)} → ${fmt(c.trimEnd)}${overlay?` • ${Math.round((c.opacity??1)*100)}%`:` • ${Number(c.speed||1).toFixed(2)}×${c.transitionOut&&c.transitionOut!=='none'?` • ◇ ${transitionLabel(c.transitionOut)} ${Number(c.transitionDuration||.45).toFixed(2)}s`:''}`}`;
    }

    leftHandle.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      e.preventDefault();e.stopPropagation();selectClip(c.id);pushHistory('Trim clip start');
      state.fitTimeline=false;$('fitTimelineBtn').classList.remove('primary');
      const startX=e.clientX,original={...c};
      leftHandle.setPointerCapture(e.pointerId);
      const move=ev=>{
        if(!leftHandle.hasPointerCapture(ev.pointerId))return;
        const next=trimLeftByDelta(original,(ev.clientX-startX)/state.pxPerSec);
        c.trimStart=next.trimStart;c.start=next.start;
        updateClipGeometry();updateInspector();
      };
      const up=ev=>{
        try{leftHandle.releasePointerCapture(ev.pointerId)}catch{}
        leftHandle.removeEventListener('pointermove',move);
        leftHandle.removeEventListener('pointerup',up);
        renderTimeline();previewTimelineAt(state.playhead,false);
      };
      leftHandle.addEventListener('pointermove',move);
      leftHandle.addEventListener('pointerup',up);
    });

    rightHandle.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      e.preventDefault();e.stopPropagation();selectClip(c.id);pushHistory('Trim clip end');
      state.fitTimeline=false;$('fitTimelineBtn').classList.remove('primary');
      const startX=e.clientX,original={...c};
      rightHandle.setPointerCapture(e.pointerId);
      const move=ev=>{
        if(!rightHandle.hasPointerCapture(ev.pointerId))return;
        const next=trimRightByDelta(original,(ev.clientX-startX)/state.pxPerSec);
        c.trimEnd=next.trimEnd;
        updateClipGeometry();updateInspector();
      };
      const up=ev=>{
        try{rightHandle.releasePointerCapture(ev.pointerId)}catch{}
        rightHandle.removeEventListener('pointermove',move);
        rightHandle.removeEventListener('pointerup',up);
        renderTimeline();previewTimelineAt(state.playhead,false);
      };
      rightHandle.addEventListener('pointermove',move);
      rightHandle.addEventListener('pointerup',up);
    });

    d.addEventListener('contextmenu',e=>{
      e.preventDefault();
      if(!state.selectedClipIds.has(c.id))selectClip(c.id);
      showClipContext(c,e.clientX,e.clientY);
    });
  });
}
function renderPlayhead(){$('playhead').style.left=`${90+state.playhead*state.pxPerSec}px`}
function renderTimeline(allowFit=true){
  if(allowFit&&state.fitTimeline){
    const lane=$('videoLane');
    const usable=Math.max(600,lane?.clientWidth||900);
    state.pxPerSec=Math.max(6,Math.min(140,(usable-12)/fittedHorizon()));
  }
  renderRuler();
  renderLane($('videoLane'),state.videoClips,'video');
  renderLane($('audioLane'),state.audioClips,'audio');
  renderLane($('overlayLane'),state.overlayClips,'overlay');
  renderLane($('effectLane'),state.effectClips,'effect');
  renderPlayhead();
}

function selectedVisualClips(){return selectedTimelineClips().filter(clip=>clip.type==='video'||clip.type==='overlay')}
function visualPresetLabel(id){
  if(id==='none')return 'None / Reset';
  const entry=[...(visualConfig.effectLibrary||[]),...(visualConfig.filterLibrary||[])].find(item=>item.id===id);
  return entry?.title||String(id).replace(/-/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase());
}
function hydrateVisualPresetSelect(){
  const select=$('clipVisualPreset');
  select.replaceChildren();
  const custom=document.createElement('option');custom.value='custom';custom.disabled=true;custom.textContent='Custom adjustments';select.appendChild(custom);
  Object.keys(visualConfig.presets).forEach(id=>{
    const option=document.createElement('option');option.value=id;option.textContent=visualPresetLabel(id);select.appendChild(option);
  });
}
hydrateVisualPresetSelect();
function groupLibraryItems(items,query){
  const normalized=String(query||'').trim().toLocaleLowerCase();
  return (items||[]).filter(item=>!normalized||`${item.title} ${item.category} ${item.detail}`.toLocaleLowerCase().includes(normalized));
}
function addEffectClip(effectId,start=state.playhead){
  const definition=effectDefinition(effectId);
  if(!definition)return;
  if(!state.videoClips.length)return notify('Add a video clip before adding an animated effect.','warn');
  const projectLength=projectEnd();
  const requestedStart=bounded(start,0,Math.max(0,projectLength-.05),0);
  const duration=Math.max(.25,Math.min(Number(definition.duration)||3,projectLength-requestedStart));
  if(duration<.05)return notify('Move the playhead inside the video project before adding an effect.','warn');
  pushHistory(`Add ${definition.title} effect`);
  const clip={
    id:uid(),effectId:definition.id,name:definition.title,type:'effect',start:requestedStart,
    trimStart:0,trimEnd:duration,duration:Math.max(600,projectLength),speed:1,volume:1,fadeIn:0,fadeOut:0
  };
  state.effectClips.push(clip);state.effectClips.sort((a,b)=>a.start-b.start);
  state.selectedClipIds=new Set([clip.id]);state.selectedClipId=clip.id;state.clipSelectionAnchorId=clip.id;
  state.timelinePreview=true;renderTimeline();updateInspector();previewTimelineAt(state.playhead,false);
  notify(`${definition.title} added to the EFFECTS track`,'success');
}
function renderVisualCardLibrary(containerId,items,query,kind){
  const container=$(containerId);if(!container)return;
  const visible=groupLibraryItems(items,query);
  container.replaceChildren();
  if(!visible.length){
    const empty=document.createElement('div');empty.className='status';empty.textContent=`No ${kind} match that search.`;container.appendChild(empty);return;
  }
  const grouped=new Map();
  visible.forEach(item=>{const group=grouped.get(item.category)||[];group.push(item);grouped.set(item.category,group)});
  const selected=selectedVisualClips();
  const primary=selected.find(clip=>clip.id===state.selectedClipId)||selected.at(-1)||null;
  const activeId=kind==='effect'&&state.selectedClipIds.size===1&&findClip(state.selectedClipId)?.type==='effect'?findClip(state.selectedClipId).effectId:primary?matchingVisualPreset(clipVisual(primary)):'';
  for(const [category,entries] of grouped){
    const section=document.createElement('section');section.className='visual-library-section';
    const heading=document.createElement('div');heading.className='visual-library-heading';heading.textContent=category;section.appendChild(heading);
    const grid=document.createElement('div');grid.className='visual-card-grid';
    entries.forEach(item=>{
      const button=document.createElement('button');button.type='button';button.className=`visual-card ${activeId===item.id?'selected':''}`;button.disabled=kind!=='effect'&&!selected.length;
      button.title=kind==='effect'?`Drag ${item.title} to the EFFECTS track or click to add it at the playhead.`:`Apply ${item.title}: ${item.detail}`;
      if(kind==='effect'){
        button.draggable=true;
        button.addEventListener('dragstart',event=>{
          event.dataTransfer.effectAllowed='copy';
          event.dataTransfer.setData('application/x-emx-effect-id',item.id);
          event.dataTransfer.setData('text/plain',item.id);
        });
      }
      const swatch=document.createElement('span');swatch.className='visual-card-swatch';swatch.dataset.swatch=item.swatch||'violet';
      const title=document.createElement('span');title.className='visual-card-title';title.textContent=item.title;
      const detail=document.createElement('span');detail.className='visual-card-detail';detail.textContent=item.detail;
      button.append(swatch,title,detail);
      button.addEventListener('click',()=>kind==='effect'?addEffectClip(item.id,state.playhead):applyVisualPreset(item.id,item.title));
      grid.appendChild(button);
    });
    section.appendChild(grid);container.appendChild(section);
  }
}
function transitionLabel(id){
  if(id==='none')return 'None';
  return (visualConfig.transitionLibrary||[]).find(item=>item.id===id)?.title||visualPresetLabel(id);
}
function renderTransitionLibrary(){
  const container=$('transitionLibrary');if(!container)return;
  const visible=groupLibraryItems(visualConfig.transitionLibrary,$('transitionSearch')?.value||'');
  const clip=inspectorPrimaryClip();
  const hasSingleVideo=selectedTimelineClips().length===1&&clip?.type==='video';
  const canApply=hasSingleVideo&&!!nextVideoClip(clip);
  const hint=$('transitionLibraryHint');
  if(!hasSingleVideo){hint.className='status warn';hint.textContent='Select one video clip that has another video after it, then choose a transition.'}
  else if(!canApply){hint.className='status warn';hint.textContent='Add another video after this clip before applying a transition.'}
  else {hint.className='status good';hint.textContent=`Choose how ${clip.name} enters the next video. Every option previews and exports with the selected duration.`}
  container.replaceChildren();
  if(!visible.length){const empty=document.createElement('div');empty.className='status';empty.textContent='No transition matches that search.';container.appendChild(empty);return}
  visible.forEach(item=>{
    const button=document.createElement('button');button.type='button';button.className=`transition-card ${clip?.transitionOut===item.id?'selected':''}`;button.disabled=!canApply;
    button.title=`Apply ${item.title}: ${item.detail}`;
    const swatch=document.createElement('span');swatch.className='transition-card-swatch';swatch.dataset.transitionSwatch=item.swatch||'dissolve';
    const title=document.createElement('span');title.className='visual-card-title';title.textContent=item.title;
    const detail=document.createElement('span');detail.className='visual-card-detail';detail.textContent=item.detail;
    button.append(swatch,title,detail);
    button.addEventListener('click',()=>{
      const target=inspectorPrimaryClip();if(!target||target.type!=='video')return;
      pushHistory(`Apply ${item.title} transition`);
      configureTransition(target,item.id);
      refreshTimelineAfterInspectorEdit();
    });
    container.appendChild(button);
  });
}
function updateVisualLibraryState(){
  const clips=selectedVisualClips();
  const effectHint=$('effectLibraryHint'),filterHint=$('filterLibraryHint');
  if(effectHint){effectHint.className=state.videoClips.length?'status good':'status warn';effectHint.textContent=state.videoClips.length?'Drag an effect onto the EFFECTS track or click it to add at the playhead. Then move, split, or trim its timeline clip.':'Add video to the timeline before adding an animated effect.'}
  if(filterHint){filterHint.className=clips.length?'status good':'status warn';filterHint.textContent=clips.length?(clips.length>1?`${clips.length} visual clips selected. Applying a filter updates all of them.`:'Choose a static color filter for the selected clip. Filters are baked into exported MP4s.'):'Select a video or image overlay on the timeline, then choose a filter.'}
  renderVisualCardLibrary('effectLibrary',visualConfig.effectLibrary,$('effectSearch')?.value||'','effect');
  renderVisualCardLibrary('filterLibrary',visualConfig.filterLibrary,$('filterSearch')?.value||'','filter');
  renderTransitionLibrary();
}
function matchingVisualPreset(visual){
  const fields=['brightness','contrast','saturation','blur','hue','vignette'];
  return Object.entries(visualConfig.presets).find(([,preset])=>fields.every(field=>Math.abs((visual[field]??0)-(preset[field]??0))<.005))?.[0]||'custom';
}
function updateClipVisualControls(){
  const clips=selectedVisualClips();
  const primary=clips.find(clip=>clip.id===state.selectedClipId)||clips.at(-1)||null;
  const controls=['clipVisualPreset','clipBrightness','clipContrast','clipSaturation','clipHue','clipBlur','clipVignette'];
  controls.forEach(id=>$(id).disabled=!primary);
  const hint=$('clipVisualHint');
  if(!primary){
    hint.className='status warn';
    hint.textContent='Select a video or image overlay on the timeline to apply a visual preset or precise adjustments.';
    updateVisualLibraryState();
    return;
  }
  hint.className='status good';
  hint.textContent=clips.length>1?`${clips.length} visual clips selected. Presets and adjustments apply to all selected visual clips.`:`Editing visual adjustments for ${primary.type==='overlay'?'this image overlay':'this video clip'}.`;
  const visual=clipVisual(primary);
  $('clipVisualPreset').value=matchingVisualPreset(visual);
  $('clipBrightness').value=visual.brightness;$('clipBrightnessVal').textContent=visual.brightness.toFixed(2);
  $('clipContrast').value=visual.contrast;$('clipContrastVal').textContent=visual.contrast.toFixed(2);
  $('clipSaturation').value=visual.saturation;$('clipSaturationVal').textContent=visual.saturation.toFixed(2);
  $('clipHue').value=visual.hue;$('clipHueVal').textContent=`${visual.hue.toFixed(0)}°`;
  $('clipBlur').value=visual.blur;$('clipBlurVal').textContent=visual.blur.toFixed(1);
  $('clipVignette').value=visual.vignette;$('clipVignetteVal').textContent=`${Math.round(visual.vignette*100)}%`;
  updateVisualLibraryState();
}

function updateInspector(){
  reconcileActiveSelections();
  const selected=selectedTimelineClips();
  const c=selected.find(clip=>clip.id===state.selectedClipId)||selected.at(-1)||null;
  const selectedVideos=selected.filter(clip=>clip.type==='video');
  const primaryVideo=selectedVideos.find(clip=>clip.id===state.selectedClipId)||selectedVideos.at(-1)||null;
  const multiple=selected.length>1;
  const effectOnly=Boolean(c&&c.type==='effect');
  $('selectionType').textContent=multiple?`${selected.length} CLIPS`:(c?c.type.toUpperCase():(state.selectedMediaId?'MEDIA':'NONE'));

  const timelineOnly=['clipStart','trimIn','trimOut','speed','volume','fadeIn','fadeOut','duplicateClip','deleteClip'];
  timelineOnly.forEach(id=>{ const el=$(id); if(el)el.disabled=!c; });
  ['clipStart','trimIn','trimOut','duplicateClip'].forEach(id=>$(id).disabled=!c||multiple);
  ['speed','volume','fadeIn','fadeOut'].forEach(id=>$(id).disabled=!c||effectOnly);
  $('overlayLayoutGroup').hidden=!c||c.type!=='overlay'||multiple;
  $('transitionGroup').hidden=!c||c.type!=='video'||multiple;
  $('videoTransformGroup').hidden=!primaryVideo;
  ['clipZoom','clipPanX','clipPanY','resetClipTransform'].forEach(id=>$(id).disabled=!primaryVideo);
  ['overlayPosition','overlayOpacity','overlayScale'].forEach(id=>$(id).disabled=!c||c.type!=='overlay'||multiple);
  ['transitionOut','transitionDuration'].forEach(id=>$(id).disabled=!c||c.type!=='video'||multiple);
  updateClipVisualControls();
  if(primaryVideo){
    const transform=clipVisual(primaryVideo);
    $('clipZoom').value=transform.zoom;$('clipZoomVal').textContent=`${Math.round(transform.zoom*100)}%`;
    $('clipPanX').value=transform.panX;$('clipPanXVal').textContent=`${Math.round(transform.panX*100)}%`;
    $('clipPanY').value=transform.panY;$('clipPanYVal').textContent=`${Math.round(transform.panY*100)}%`;
    $('videoTransformHint').textContent=selectedVideos.length>1?`Visual framing will apply to ${selectedVideos.length} selected video clips.`:'Zoom changes the picture inside the canvas, not the timeline. Pan selects which part remains visible.';
  }
  $('clipHint').style.display=c?'none':'block';
  if(multiple){
    $('clipHint').style.display='block';
    $('clipHint').className='status good';
    $('clipHint').textContent=`${selected.length} timeline clips selected. Speed, volume, and fades apply to all selected clips; timing and trim stay single-clip to prevent accidental edits.`;
  }else{
    $('clipHint').className='status warn';
    $('clipHint').textContent=effectOnly?'Animated effect selected. Move it on the EFFECTS track or edit its start, trim range, split, and duration.':'Add a media item to the timeline, then click the timeline clip to edit Trim, Speed and Clip Volume.';
    if(effectOnly){$('clipHint').style.display='block';$('clipHint').className='status good'}
  }

  if(!c){
    $('startVal').textContent='—';
    $('trimInVal').textContent='—';
    $('trimOutVal').textContent='—';
    $('speedVal').textContent='—';
    $('volumeVal').textContent='—';$('fadeInVal').textContent='—';$('fadeOutVal').textContent='—';
    return;
  }

  $('clipStart').max=Math.max(60,c.start+30);
  $('clipStart').value=c.start;
  $('trimIn').max=c.duration;
  $('trimOut').max=c.duration;
  $('trimIn').value=c.trimStart;
  $('trimOut').value=c.trimEnd;
  $('speed').value=c.speed||1;
  $('volume').value=c.volume??1;$('fadeIn').value=c.fadeIn||0;$('fadeOut').value=c.fadeOut||0;
  $('startVal').textContent=fmt(c.start);
  $('trimInVal').textContent=fmt(c.trimStart);
  $('trimOutVal').textContent=fmt(c.trimEnd);
  $('speedVal').textContent=effectOnly?'FIXED':Number(c.speed||1).toFixed(2)+'×';
  $('volumeVal').textContent=effectOnly?'N/A':Math.round((c.volume??1)*100)+'%';$('fadeInVal').textContent=effectOnly?'N/A':(c.fadeIn||0).toFixed(2)+'s';$('fadeOutVal').textContent=effectOnly?'N/A':(c.fadeOut||0).toFixed(2)+'s';
  if(c.type==='overlay'){
    $('overlayPosition').value=visualConfig.positions.includes(c.position)?c.position:defaultOverlay.position;
    $('overlayOpacity').value=bounded(c.opacity,.1,1,defaultOverlay.opacity);$('overlayOpacityVal').textContent=`${Math.round(bounded(c.opacity,.1,1,defaultOverlay.opacity)*100)}%`;
    $('overlayScale').value=bounded(c.scale,.08,1,defaultOverlay.scale);$('overlayScaleVal').textContent=`${Math.round(bounded(c.scale,.08,1,defaultOverlay.scale)*100)}%`;
  }
  if(c.type==='video'){
    $('transitionOut').value=visualConfig.transitionTypes.includes(c.transitionOut)?c.transitionOut:'none';
    $('transitionDuration').value=bounded(c.transitionDuration,.1,2,.45);$('transitionDurationVal').textContent=`${bounded(c.transitionDuration,.1,2,.45).toFixed(2)}s`;
    $('transitionHint').textContent=c.transitionOut==='dip-black'?'Dip to Black fades this clip out and brings the next one up from black in preview and MP4 export.':c.transitionOut==='slide-left'||c.transitionOut==='slide-right'?`${transitionLabel(c.transitionOut)} moves the next clip over this one in preview and MP4 export.`:'Dissolve overlaps the next video clip and renders the blend in the preview and MP4 export.';
  }
}
function bindRange(id,fn){$(id).addEventListener('input',e=>fn(+e.target.value))}
function inspectorPrimaryClip(){return selectedTimelineClips().find(clip=>clip.id===state.selectedClipId)||null}
function refreshTimelineAfterInspectorEdit(){
  state.playhead=Math.min(state.playhead,projectEnd());
  renderTimeline();
  updateInspector();
  if(state.timelinePreview)previewTimelineAt(state.playhead,state.timelinePlaying);
}
function beginInspectorHistory(label){
  const control=$(label.controlId);
  if(control?.dataset.editing)return;
  if(control)control.dataset.editing='1';
  pushHistory(label.name);
}
function endInspectorHistory(controlId){delete $(controlId).dataset.editing}
[
  ['clipStart','Move clip'],['trimIn','Trim clip start'],['trimOut','Trim clip end'],['speed','Change clip speed'],
  ['volume','Change clip volume'],['fadeIn','Change fade in'],['fadeOut','Change fade out'],
  ['clipBrightness','Adjust clip brightness'],['clipContrast','Adjust clip contrast'],['clipSaturation','Adjust clip saturation'],
  ['clipHue','Adjust clip hue'],['clipBlur','Adjust clip blur'],['clipVignette','Adjust clip vignette'],
  ['clipZoom','Adjust visual zoom'],['clipPanX','Pan clip horizontally'],['clipPanY','Pan clip vertically'],
  ['overlayOpacity','Change overlay opacity'],['overlayScale','Change overlay scale'],['transitionDuration','Change transition duration']
].forEach(([controlId,name])=>{
  $(controlId).addEventListener('pointerdown',()=>beginInspectorHistory({controlId,name}));
  $(controlId).addEventListener('change',()=>endInspectorHistory(controlId));
});
bindRange('clipStart',x=>{const c=inspectorPrimaryClip();if(!c)return;c.start=x;refreshTimelineAfterInspectorEdit()});
bindRange('trimIn',x=>{const c=inspectorPrimaryClip();if(!c)return;c.trimStart=Math.min(x,c.trimEnd-.05);refreshTimelineAfterInspectorEdit()});
bindRange('trimOut',x=>{const c=inspectorPrimaryClip();if(!c)return;c.trimEnd=Math.max(x,c.trimStart+.05);refreshTimelineAfterInspectorEdit()});
bindRange('speed',x=>{const clips=selectedTimelineClips().filter(c=>c.type!=='effect');if(!clips.length)return;clips.forEach(c=>c.speed=x);refreshTimelineAfterInspectorEdit()});
bindRange('volume',x=>{const clips=selectedTimelineClips().filter(c=>c.type!=='effect');if(!clips.length)return;clips.forEach(c=>c.volume=x);updateInspector();if(state.timelinePreview)previewTimelineAt(state.playhead,state.timelinePlaying)});
bindRange('fadeIn',x=>{const clips=selectedTimelineClips().filter(c=>c.type!=='effect');if(!clips.length)return;clips.forEach(c=>c.fadeIn=Math.min(x,clipTimelineDuration(c)));updateInspector();if(state.timelinePreview)previewTimelineAt(state.playhead,state.timelinePlaying)});
bindRange('fadeOut',x=>{const clips=selectedTimelineClips().filter(c=>c.type!=='effect');if(!clips.length)return;clips.forEach(c=>c.fadeOut=Math.min(x,clipTimelineDuration(c)));updateInspector();if(state.timelinePreview)previewTimelineAt(state.playhead,state.timelinePlaying)});

function updateSelectedVisuals(mutator){
  const clips=selectedVisualClips();
  if(!clips.length)return;
  clips.forEach(clip=>{clip.visual=clipVisual(clip);mutator(clip.visual,clip)});
  updateClipVisualControls();
  renderTimeline();
  if(state.timelinePreview)previewTimelineAt(state.playhead,state.timelinePlaying);
}
function updateSelectedVideoTransforms(mutator){
  const clips=selectedTimelineClips().filter(clip=>clip.type==='video');
  if(!clips.length)return;
  clips.forEach(clip=>{clip.visual=clipVisual(clip);mutator(clip.visual,clip)});
  updateInspector();
  if(state.timelinePreview)previewTimelineAt(state.playhead,state.timelinePlaying);
}
function applyVisualPreset(id,title=visualPresetLabel(id)){
  const preset=visualConfig.presets[id];
  if(!preset)return;
  if(!selectedVisualClips().length)return notify('Select a video or image overlay on the timeline first.','warn');
  pushHistory(`Apply ${title}`);
  updateSelectedVisuals(visual=>Object.assign(visual,preset));
  updateVisualLibraryState();
}
function updateVisualRange(id,valueKey,formatter=x=>String(x)){
  bindRange(id,value=>{
    updateSelectedVisuals(visual=>{visual[valueKey]=value});
    $(`${id}Val`).textContent=formatter(value);
  });
}
$('clipVisualPreset').onchange=e=>{
  const preset=visualConfig.presets[e.target.value];
  if(!preset)return;
  applyVisualPreset(e.target.value,e.target.selectedOptions[0]?.textContent||'visual preset');
};
bindRange('clipZoom',value=>updateSelectedVideoTransforms(visual=>{visual.zoom=value}));
bindRange('clipPanX',value=>updateSelectedVideoTransforms(visual=>{visual.panX=value}));
bindRange('clipPanY',value=>updateSelectedVideoTransforms(visual=>{visual.panY=value}));
$('resetClipTransform').onclick=()=>{
  if(!selectedTimelineClips().some(clip=>clip.type==='video'))return;
  pushHistory('Reset visual framing');
  updateSelectedVideoTransforms(visual=>{visual.zoom=1;visual.panX=0;visual.panY=0});
};
['effectSearch','filterSearch','transitionSearch'].forEach(id=>$(id).addEventListener('input',updateVisualLibraryState));
updateVisualRange('clipBrightness','brightness',value=>value.toFixed(2));
updateVisualRange('clipContrast','contrast',value=>value.toFixed(2));
updateVisualRange('clipSaturation','saturation',value=>value.toFixed(2));
updateVisualRange('clipHue','hue',value=>`${value.toFixed(0)}°`);
updateVisualRange('clipBlur','blur',value=>value.toFixed(1));
updateVisualRange('clipVignette','vignette',value=>`${Math.round(value*100)}%`);

function selectedOverlayClips(){return selectedTimelineClips().filter(clip=>clip.type==='overlay')}
function updateSelectedOverlays(mutator){
  const clips=selectedOverlayClips();
  if(!clips.length)return;
  clips.forEach(mutator);
  renderTimeline();
  updateInspector();
  updateOverlayPreview();
}
$('overlayPosition').onchange=e=>{pushHistory('Move image overlay');updateSelectedOverlays(clip=>{clip.position=e.target.value})};
bindRange('overlayOpacity',value=>updateSelectedOverlays(clip=>{clip.opacity=value}));
bindRange('overlayScale',value=>updateSelectedOverlays(clip=>{clip.scale=value}));

function nextVideoClip(clip){
  const ordered=sortedVideoClips();
  return ordered.slice(ordered.findIndex(item=>item.id===clip.id)+1).find(item=>item.id!==clip.id)||null;
}
function transitionOverlapsNext(type){return type==='crossfade'||type==='slide-left'||type==='slide-right'}
function transitionUsesAlpha(type){return type==='crossfade'||type==='dip-black'}
function clearTransitionLink(clip,next){
  const previous=clip.transitionOut;
  if(next&&(next.transitionInStyle===previous||(!next.transitionInStyle&&previous==='crossfade'))){
    next.transitionIn=0;
    next.transitionInStyle='none';
  }
  clip.transitionOut='none';
}
function configureTransition(clip,requestedType=clip.transitionOut){
  const next=nextVideoClip(clip);
  if(!visualConfig.transitionTypes.includes(requestedType)||requestedType==='none'){
    clearTransitionLink(clip,next);
    return true;
  }
  if(!next){
    clip.transitionOut='none';
    notify(`${transitionLabel(requestedType)} needs another video clip after the selected clip.`,'warn');
    return false;
  }
  const duration=Math.min(
    bounded(clip.transitionDuration,.1,2,.45),
    Math.max(.1,clipTimelineDuration(clip)-.05),
    Math.max(.1,clipTimelineDuration(next)-.05)
  );
  clip.transitionOut=requestedType;
  clip.transitionDuration=duration;
  next.transitionIn=duration;
  next.transitionInStyle=requestedType;
  next.start=Math.max(0,clip.start+clipTimelineDuration(clip)-(transitionOverlapsNext(requestedType)?duration:0));
  state.videoClips.sort((left,right)=>left.start-right.start);
  return true;
}
function configureCrossFade(clip,requestedType='crossfade'){return configureTransition(clip,requestedType)}
$('transitionOut').onchange=e=>{
  const clip=inspectorPrimaryClip();if(!clip||clip.type!=='video')return;
  pushHistory(e.target.value==='none'?'Remove transition':`Apply ${transitionLabel(e.target.value)} transition`);
  configureTransition(clip,e.target.value);
  refreshTimelineAfterInspectorEdit();
};
bindRange('transitionDuration',value=>{
  const clip=inspectorPrimaryClip();if(!clip||clip.type!=='video')return;
  clip.transitionDuration=value;
  if(clip.transitionOut&&clip.transitionOut!=='none')configureTransition(clip,clip.transitionOut);
  $('transitionDurationVal').textContent=`${clip.transitionDuration.toFixed(2)}s`;
  refreshTimelineAfterInspectorEdit();
});
bindRange('brightness',x=>{state.effects.brightness=x;$('brightnessVal').textContent=x.toFixed(2);applyPreviewFx()});
bindRange('contrast',x=>{state.effects.contrast=x;$('contrastVal').textContent=x.toFixed(2);applyPreviewFx()});
bindRange('saturation',x=>{state.effects.saturation=x;$('saturationVal').textContent=x.toFixed(2);applyPreviewFx()});
bindRange('blur',x=>{state.effects.blur=x;$('blurVal').textContent=x.toFixed(1);applyPreviewFx()});
bindRange('crf',x=>{state.export.crf=x;$('crfVal').textContent=x});

$('exportResolution').onchange=e=>{
  const [w,h]=e.target.value.split('x').map(Number);
  state.export.width=w;state.export.height=h;
};
$('exportFit').onchange=e=>state.export.fit=e.target.value==='contain'?'contain':'cover';
$('exportFps').onchange=e=>state.export.fps=Number(e.target.value)||60;

bindRange('zoom',x=>{
  state.fitTimeline=false;
  $('fitTimelineBtn').classList.remove('primary');
  state.pxPerSec=x;
  renderTimeline(false);
});
$('fitTimelineBtn').onclick=()=>{
  state.fitTimeline=true;
  $('fitTimelineBtn').classList.add('primary');
  fitTimelineIfNeeded();
  notify('Timeline fitted to project');
};
bindRange('masterVolume',x=>{
  v.volume=x;a.volume=x;
  for(const player of timelineAudioPlayers.values())player.volume=x;
  $('muteBtn').textContent=state.previewMuted?'🔇':'🔊';
  $('masterVolume').title=`Preview volume ${Math.round(x*100)}%`;
});
bindRange('defaultVolume',x=>state.settings.defaultVolume=x);


function updateWatermarkPreview(){
  const b=state.branding,layer=$('watermarkLayer'),logo=$('watermarkLogoPreview');
  layer.style.display='flex';
  layer.dataset.position=b.position;
  layer.style.opacity=String(Math.max(.5,Math.min(1,b.opacity)));
  const panel=$('previewPanel');
  const unit=Math.max(64,Math.min(230,(panel.clientWidth||800)*.16));
  logo.src='./emx-clips-watermark.png';
  logo.style.display='block';
  logo.style.width=`${unit}px`;
  layer.style.setProperty('--wm-margin',`${Math.max(12,Math.min(32,(panel.clientWidth||800)*.028))}px`);
}
function syncBrandingControls(){
  $('watermarkOpacity').value=state.branding.opacity;
  $('watermarkOpacityVal').textContent=Math.round(state.branding.opacity*100)+'%';
  $('watermarkPosition').value=state.branding.position;
  updateWatermarkPreview();
}
function setBranding(mutator,label='Change watermark'){
  pushHistory(label);
  mutator(state.branding);
  state.branding.opacity=Math.max(.5,Math.min(1,Number(state.branding.opacity)||.78));
  syncBrandingControls();
}
$('watermarkOpacity').oninput=e=>{state.branding.opacity=Math.max(.5,+e.target.value);$('watermarkOpacityVal').textContent=Math.round(state.branding.opacity*100)+'%';updateWatermarkPreview()};
$('watermarkOpacity').onchange=()=>pushHistory('Watermark opacity');
$('watermarkPosition').onchange=e=>setBranding(b=>b.position=e.target.value);
window.addEventListener('resize',updateWatermarkPreview);

function applyPreviewFx(primary=videoClipAtTime(state.playhead),secondary=null){
  v.style.filter=cssFilterForClip(primary,state.playhead);
  transitionVideo.style.filter=cssFilterForClip(secondary||primary,state.playhead);
  previewImage.style.filter=cssFilterForClip(primary,state.playhead);
  const animated=animatedEffectStateAt(state.playhead);
  $('previewVignette').style.opacity=String(bounded(Math.max(clipVisual(primary).vignette,animated.vignette),0,1,0));
}
$('previewQuality').onchange=e=>state.settings.previewQuality=e.target.value;
$('snapSetting').onchange=e=>state.settings.snap=e.target.value==='on';
$('autoplaySetting').onchange=e=>state.settings.autoplayPreview=e.target.value==='on';

$('mediaList').addEventListener('click',async e=>{
  const p=e.target.closest('[data-preview]');
  const add=e.target.closest('[data-add]');
  const menu=e.target.closest('[data-menu]');
  if(p)await selectMedia(p.dataset.preview,true);
  if(add)addClip(add.dataset.add,add.dataset.track);
  if(menu){
    const media=state.media.find(item=>item.id===menu.dataset.menu);
    if(media){const rect=menu.getBoundingClientRect();showMediaContext(media,rect.left,rect.bottom+4)}
  }
  if(!p&&!add&&!menu){
    const card=e.target.closest('.media-item');
    if(card)await selectMedia(card.dataset.mediaId,false,modifierSelection(e));
  }
});

let contextMediaId=null;
function hideMediaContext(){$('mediaContext').classList.remove('show');contextMediaId=null}
function showMediaContext(media,x,y){
  contextMediaId=media.id;
  const menu=$('mediaContext');
  const extract=menu.querySelector('[data-video-only]');
  if(extract)extract.style.display=media.type==='video'?'block':'none';
  menu.style.visibility='hidden';
  menu.classList.add('show');
  requestAnimationFrame(()=>{
    const w=menu.offsetWidth||245,h=menu.offsetHeight||300,pad=8;
    menu.style.left=`${Math.max(pad,Math.min(window.innerWidth-w-pad,x))}px`;
    menu.style.top=`${Math.max(pad,Math.min(window.innerHeight-h-pad,y))}px`;
    menu.style.visibility='visible';
  });
}
$('mediaContext').addEventListener('click',async event=>{
  const action=event.target.closest('[data-media-action]')?.dataset.mediaAction;
  const media=state.media.find(item=>item.id===contextMediaId);
  hideMediaContext();
  if(!action||!media)return;
  if(action==='preview')return selectMedia(media.id,true);
  if(action==='add')return addSelectedMediaToTimeline();
  if(action==='extract')return doExtract(media.id);
  if(action==='rename'){
    const name=window.prompt('Project display name',media.name);
    if(name===null)return;
    const next=name.trim();
    if(!next)return notify('A display name cannot be empty.','warn');
    pushHistory('Rename media label');
    media.name=next;
    [...state.videoClips,...state.audioClips].filter(clip=>clip.mediaId===media.id).forEach(clip=>clip.name=next);
    renderMedia();renderTimeline();notify('Project display label updated','success');
    return;
  }
  if(action==='reveal'){
    if(!media.nativePath||!window.emxDesktop?.revealInExplorer)return notify('Reveal in Explorer requires the desktop media path.','warn');
    try{await window.emxDesktop.revealInExplorer(media.nativePath)}catch(error){notify(String(error?.message||error),'error','Reveal Failed')}
    return;
  }
  if(action==='info'){
    return window.alert(`Name: ${media.name}\nType: ${media.type.toUpperCase()}\nDuration: ${fmt(media.duration)}\nPath: ${media.nativePath||'Browser-only import (re-import in desktop mode for native export)'}`);
  }
  if(action==='remove')removeMediaItems(state.selectedMediaIds.has(media.id)?[...state.selectedMediaIds]:[media.id]);
});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#mediaContext'))hideMediaContext()});

function removeMediaItems(ids){
  const targets=state.media.filter(media=>new Set(ids||[]).has(media.id));
  if(!targets.length)return;
  const targetIds=new Set(targets.map(media=>media.id));
  const used=state.videoClips.some(c=>targetIds.has(c.mediaId))||state.audioClips.some(c=>targetIds.has(c.mediaId))||state.overlayClips.some(c=>targetIds.has(c.mediaId));
  if(used){
    const ok=window.confirm(`${targets.length} selected media item(s) are used on the timeline.\n\nRemove them from this project and remove their timeline clips? Original files on your PC will not be deleted.`);
    if(!ok)return;
    stopTimelinePlayback();
    const removedIds=[
      ...state.videoClips.filter(c=>targetIds.has(c.mediaId)).map(c=>c.id),
      ...state.audioClips.filter(c=>targetIds.has(c.mediaId)).map(c=>c.id),
      ...state.overlayClips.filter(c=>targetIds.has(c.mediaId)).map(c=>c.id)
    ];
    removedIds.forEach(cid=>{
      const p=timelineAudioPlayers.get(cid);
      if(p){p.pause();timelineAudioPlayers.delete(cid)}
    });
    state.videoClips=state.videoClips.filter(c=>!targetIds.has(c.mediaId));
    state.audioClips=state.audioClips.filter(c=>!targetIds.has(c.mediaId));
    state.overlayClips=state.overlayClips.filter(c=>!targetIds.has(c.mediaId));
  }
  if(targetIds.has(state.selectedMediaId)){
    v.pause();transitionVideo.pause();a.pause();
    v.removeAttribute('src');transitionVideo.removeAttribute('src');a.removeAttribute('src');previewImage.removeAttribute('src');v.load();transitionVideo.load();a.load();
    v.style.display='none';transitionVideo.style.display='none';a.style.display='none';previewImage.style.display='none';
    $('previewEmpty').style.display='';
    $('previewBadge').textContent='NO MEDIA SELECTED';
    state.selectedMediaId=null;
    state.isPlaying=false;
    $('playPause').textContent='▶';
    state.playhead=0;
  }
  for(const media of targets){
    if(media.revokeUrl)try{URL.revokeObjectURL(media.url)}catch{}
    if(media.mediaToken)window.emxDesktop?.releaseMediaToken?.(media.mediaToken);
  }
  state.media=state.media.filter(media=>!targetIds.has(media.id));
  state.selectedMediaIds=reconcileSelection(state.selectedMediaIds,orderedMediaIds());
  state.selectedClipIds=reconcileSelection(state.selectedClipIds,orderedTimelineClipIds());
  reconcileActiveSelections();
  renderMedia();renderTimeline();updateInspector();updateTransport();updateOverlayPreview();syncBrandingControls();updateHistoryButtons();
  notify(`${targets.length} imported media item(s) removed from this project`);
}

function removeMedia(id){return removeMediaItems([id])}


function sortedVideoClips(){
  return state.videoClips.slice().sort((a,b)=>a.start-b.start);
}

function videoClipsAtTime(t){
  return sortedVideoClips().filter(clip=>timelineClipAtTime([clip],t));
}
function videoClipAtTime(t){
  return videoClipsAtTime(t)[0]||null;
}

function audioClipAtTime(t){
  return timelineClipAtTime(state.audioClips,t);
}
function audioClipsAtTime(t){
  return state.audioClips.filter(c=>timelineClipAtTime([c],t));
}
function overlayClipsAtTime(t){
  return state.overlayClips.filter(c=>timelineClipAtTime([c],t));
}
function effectClipsAtTime(t){return state.effectClips.filter(c=>timelineClipAtTime([c],t))}
function hasTimeline(){return state.videoClips.length>0||state.audioClips.length>0||state.overlayClips.length>0||state.effectClips.length>0}
function clipGainAt(c,t){
  const local=Math.max(0,t-c.start),dur=clipTimelineDuration(c);
  let gain=1;
  if((c.fadeIn||0)>0&&local<c.fadeIn)gain*=local/c.fadeIn;
  if((c.fadeOut||0)>0&&local>dur-c.fadeOut)gain*=Math.max(0,(dur-local)/c.fadeOut);
  return Math.max(0,Math.min(1,gain));
}

function previewSourceTime(c,t){
  if(c.isFreeze)return bounded(c.freezeSourceTime,0,Math.max(0,c.duration||0),0);
  return c.trimStart + Math.max(0,t-c.start)*(c.speed||1);
}

function previewClipOpacity(c,t){
  const local=Math.max(0,t-c.start),duration=clipTimelineDuration(c);
  let opacity=1;
  const transitionIn=bounded(c.transitionIn,0,2,0);
  const transitionInStyle=c.transitionInStyle||'crossfade';
  const transitionOut=transitionUsesAlpha(c.transitionOut)?bounded(c.transitionDuration,.1,2,.45):0;
  if(transitionIn>0&&transitionUsesAlpha(transitionInStyle)&&local<transitionIn)opacity*=local/transitionIn;
  if(transitionOut>0&&local>duration-transitionOut)opacity*=Math.max(0,(duration-local)/transitionOut);
  return bounded(opacity,0,1,1);
}
function previewClipTransform(c,t){
  const visual=clipVisual(c);
  const style=c.transitionInStyle||'none';
  const duration=bounded(c.transitionIn,0,2,0);
  let slide=0;
  if(duration&&(style==='slide-left'||style==='slide-right')){
    const progress=bounded((t-c.start)/duration,0,1,1);
    const offset=(1-progress)*100;
    slide=style==='slide-left'?offset:-offset;
  }
  const travel=Math.max(0,visual.zoom-1)*50;
  const panX=visual.panX*travel;
  const panY=visual.panY*travel;
  return `translateX(${slide}%) translate(${panX.toFixed(3)}%,${panY.toFixed(3)}%) scale(${visual.zoom.toFixed(3)})`;
}
function animatedEffectStateAt(t){
  const result={brightness:0,contrast:1,saturation:1,hue:0,blur:0,vignette:0};
  for(const clip of effectClipsAtTime(t)){
    const phase=(Number(clip.trimStart)||0)+Math.max(0,t-clip.start);
    const wave=frequency=>(Math.sin(phase*Math.PI*2*frequency)+1)/2;
    switch(clip.effectId){
      case 'neon-pulse': result.brightness+=.03+.08*wave(2);result.contrast*=1+.22*wave(2);result.saturation*=1+.5*wave(2);result.hue+=12*Math.sin(phase*Math.PI*2);break;
      case 'flash-strobe': result.brightness+=Math.sin(phase*Math.PI*12)>.72?.38:0;result.contrast*=1.12;break;
      case 'rgb-wave': result.hue+=55*Math.sin(phase*Math.PI*2*.75);result.saturation*=1.25+.2*wave(1.5);break;
      case 'focus-beat': result.blur+=3.2*wave(1.3);result.contrast*=1+.16*(1-wave(1.3));break;
      case 'mono-flicker': result.saturation*=Math.sin(phase*Math.PI*8)>.1?.05:1;result.contrast*=1.14;break;
      case 'warm-flicker': result.brightness+=.03+.07*wave(3.1);result.hue+=8+12*Math.sin(phase*Math.PI*2*1.1);result.saturation*=1.12;break;
      case 'nightclub': result.hue+=100*Math.sin(phase*Math.PI*2*1.8);result.saturation*=1.5;result.contrast*=1.15;break;
      case 'vignette-pulse': result.vignette=Math.max(result.vignette,.25+.55*wave(1.2));result.brightness-=.04*wave(1.2);break;
    }
  }
  return result;
}
function cssFilterForClip(clip,time=state.playhead){
  const visual=clipVisual(clip);
  const animated=animatedEffectStateAt(time);
  const brightness=bounded((state.effects.brightness||0)+visual.brightness+animated.brightness,-.9,.9,0);
  const contrast=bounded((state.effects.contrast||1)*visual.contrast*animated.contrast,.1,3,1);
  const saturation=bounded((state.effects.saturation||1)*visual.saturation*animated.saturation,0,3,1);
  const blur=bounded((state.effects.blur||0)+visual.blur+animated.blur,0,20,0);
  return `brightness(${1+brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${visual.hue+animated.hue}deg) blur(${blur}px)`;
}
function updateOverlayPreview(){
  const layer=$('previewOverlayLayer');
  layer.replaceChildren();
  if(!state.timelinePreview)return;
  for(const clip of overlayClipsAtTime(state.playhead)){
    const media=state.media.find(item=>item.id===clip.mediaId);
    if(!media)continue;
    const item=document.createElement('div');
    item.className='preview-overlay-item';
    item.dataset.position=visualConfig.positions.includes(clip.position)?clip.position:defaultOverlay.position;
    item.style.opacity=String(bounded(clip.opacity,.1,1,defaultOverlay.opacity));
    item.style.width=`${Math.round(bounded(clip.scale,.08,1,defaultOverlay.scale)*100)}%`;
    const image=document.createElement('img');
    image.src=media.url;image.alt='';image.draggable=false;
    image.style.width='100%';
    image.style.filter=cssFilterForClip(clip);
    item.appendChild(image);layer.appendChild(item);
  }
}


const timelineAudioPlayers=new Map();

function getTimelineAudioPlayer(c){
  if(timelineAudioPlayers.has(c.id))return timelineAudioPlayers.get(c.id);
  const media=state.media.find(m=>m.id===c.mediaId);
  if(!media)return null;
  const player=new Audio(media.url);
  player.preload='auto';
  timelineAudioPlayers.set(c.id,player);
  return player;
}

function stopExternalTimelineAudio(){
  for(const player of timelineAudioPlayers.values())player.pause();
}

async function syncExternalTimelineAudio(t,playing){
  const activeIds=new Set();
  for(const c of state.audioClips){
    const end=c.start+clipTimelineDuration(c);
    const player=getTimelineAudioPlayer(c);
    if(!player)continue;
    if(t>=c.start&&t<end){
      activeIds.add(c.id);
      const expected=c.trimStart+(t-c.start)*(c.speed||1);
      if(Math.abs((player.currentTime||0)-expected)>.25){
        try{player.currentTime=Math.max(0,expected)}catch{}
      }
      player.playbackRate=Math.max(.25,Math.min(4,c.speed||1));
      player.volume=Math.max(0,Math.min(1,c.volume??1))*clipGainAt(c,t)*Math.max(0,Math.min(1,+$('masterVolume').value||1));
      player.muted=state.previewMuted;
      if(playing&&player.paused){try{await player.play()}catch{}}
      if(!playing&&!player.paused)player.pause();
    }else if(!player.paused){
      player.pause();
    }
  }
  for(const [id,player] of timelineAudioPlayers){
    if(!activeIds.has(id)&&!player.paused)player.pause();
  }
}

async function previewTimelineAt(t,autoplay=false){
  const requestId=++state.previewRequestId;
  state.timelinePreview=true;
  v.onloadedmetadata=null;a.onloadedmetadata=null;
  state.playhead=Math.max(0,Math.min(projectEnd()||0,t));
  $('timelineModeBadge').style.display='block';
  a.pause();a.style.display='none';previewImage.style.display='none';

  const activeVideos=videoClipsAtTime(state.playhead);
  const c=activeVideos[0]||null;
  const secondary=activeVideos[1]||null;
  const activeAudio=audioClipsAtTime(state.playhead);

  if(!c){
    state.activeTimelineClipId=null;
    v.pause();transitionVideo.pause();v.style.display='none';transitionVideo.style.display='none';
    $('previewVignette').style.opacity='0';
    await syncExternalTimelineAudio(state.playhead,autoplay);
    if(requestId!==state.previewRequestId)return;
    if(activeAudio.length){
      const first=activeAudio[0],media=state.media.find(m=>m.id===first.mediaId);
      $('previewEmpty').style.display='none';
      $('audioTimelineVisual').style.display='grid';
      $('audioVisualTitle').textContent=first.name;
      $('audioVisualSub').textContent=`AUDIO TRACK • ${fmt(state.playhead)} / ${fmt(projectEnd())}`;
      $('audioLargeWave').style.backgroundImage=media?.waveform?`url("${waveformSvg(media.waveform)}")`:'none';
      $('previewBadge').textContent='TIMELINE • AUDIO';
    }else{
      stopExternalTimelineAudio();
      $('audioTimelineVisual').style.display='none';
      $('previewEmpty').style.display='';
      $('previewEmpty').innerHTML='<b>Timeline gap</b><br>Move the playhead onto a video or audio clip.';
      $('previewBadge').textContent='TIMELINE PREVIEW';
    }
    updateOverlayPreview();renderPlayhead();updateTimelineTimeReadout();
    return;
  }

  $('audioTimelineVisual').style.display='none';
  const media=state.media.find(m=>m.id===c.mediaId);
  if(!media)return;
  const needsSource=state.activeTimelineClipId!==c.id || v.dataset.mediaId!==c.mediaId;
  state.activeTimelineClipId=c.id;

  if(needsSource){
    v.pause();v.src=media.url;v.dataset.mediaId=c.mediaId;v.style.display='block';
    $('previewEmpty').style.display='none';
    $('previewBadge').textContent=`TIMELINE • ${c.name}`;
    await new Promise(resolve=>{
      if(v.readyState>=1)return resolve();
      const done=()=>{v.removeEventListener('loadedmetadata',done);resolve()};
      v.addEventListener('loadedmetadata',done);setTimeout(resolve,700);
    });
    if(requestId!==state.previewRequestId)return;
  }

  const sourceT=Math.min(Math.max(c.trimStart,previewSourceTime(c,state.playhead)),Math.max(c.trimStart,c.trimEnd-.01));
  if(Math.abs((v.currentTime||0)-sourceT)>.12){try{v.currentTime=sourceT}catch{}}
  v.playbackRate=Math.max(.25,Math.min(4,c.speed||1));
  v.volume=Math.max(0,Math.min(1,c.volume??1))*clipGainAt(c,state.playhead)*Math.max(0,Math.min(1,+$('masterVolume').value||1));
  v.muted=state.previewMuted;
  v.style.opacity=String(previewClipOpacity(c,state.playhead));
  v.style.transform=previewClipTransform(c,state.playhead);

  if(secondary){
    const secondaryMedia=state.media.find(media=>media.id===secondary.mediaId);
    if(secondaryMedia){
      const needsTransitionSource=transitionVideo.dataset.clipId!==secondary.id||transitionVideo.dataset.mediaId!==secondary.mediaId;
      if(needsTransitionSource){
        transitionVideo.pause();transitionVideo.src=secondaryMedia.url;transitionVideo.dataset.mediaId=secondary.mediaId;transitionVideo.dataset.clipId=secondary.id;
        await new Promise(resolve=>{
          if(transitionVideo.readyState>=1)return resolve();
          const done=()=>{transitionVideo.removeEventListener('loadedmetadata',done);resolve()};
          transitionVideo.addEventListener('loadedmetadata',done);setTimeout(resolve,700);
        });
        if(requestId!==state.previewRequestId)return;
      }
      const secondaryTime=Math.min(Math.max(secondary.trimStart,previewSourceTime(secondary,state.playhead)),Math.max(secondary.trimStart,secondary.trimEnd-.01));
      if(Math.abs((transitionVideo.currentTime||0)-secondaryTime)>.12){try{transitionVideo.currentTime=secondaryTime}catch{}}
      transitionVideo.playbackRate=Math.max(.25,Math.min(4,secondary.speed||1));
      transitionVideo.muted=true;transitionVideo.style.opacity=String(previewClipOpacity(secondary,state.playhead));transitionVideo.style.transform=previewClipTransform(secondary,state.playhead);transitionVideo.style.display='block';
      if(autoplay){try{await transitionVideo.play()}catch{}}else transitionVideo.pause();
    }
  }else{
    transitionVideo.pause();transitionVideo.style.display='none';transitionVideo.style.transform='translateX(0)';transitionVideo.removeAttribute('src');delete transitionVideo.dataset.clipId;delete transitionVideo.dataset.mediaId;
  }
  applyPreviewFx(c,secondary);
  await syncExternalTimelineAudio(state.playhead,autoplay);
  if(requestId!==state.previewRequestId)return;

  if(autoplay){try{await v.play()}catch{}}
  else v.pause();

  updateOverlayPreview();renderPlayhead();updateTimelineTimeReadout();
}

function updateTimelineTimeReadout(){
  $('scrub').max=Math.max(1,projectEnd());
  $('scrub').value=Math.min(projectEnd(),state.playhead);
  $('timeReadout').textContent=`${fmt(state.playhead)} / ${fmt(projectEnd())}`;
}

function stopTimelinePlayback(){
  timelinePlaybackSession.stop();
  state.previewRequestId++;
  if(state.timelineTimer){
    cancelAnimationFrame(state.timelineTimer);
    state.timelineTimer=null;
  }
  state.timelinePlaying=false;
  state.isPlaying=false;
  v.pause();transitionVideo.pause();
  stopExternalTimelineAudio();
  $('playPause').textContent='▶';
}

async function startTimelinePlayback(){
  if(!hasTimeline())return notify('Add video or audio clips to the timeline first.');
  if(state.playhead>=projectEnd()-.01)state.playhead=0;

  state.timelinePreview=true;
  state.timelinePlaying=true;
  state.isPlaying=true;
  $('playPause').textContent='⏸';
  const playbackToken=timelinePlaybackSession.begin();
  const ownsPlayback=()=>state.timelinePlaying&&state.timelinePreview&&timelinePlaybackSession.owns(playbackToken);

  await previewTimelineAt(state.playhead,true);
  if(!ownsPlayback())return;
  let last=performance.now();

  async function tick(now){
    if(!ownsPlayback()){state.timelineTimer=null;return}
    const dt=Math.min(.08,(now-last)/1000);
    last=now;
    state.playhead+=dt;

    if(state.playhead>=projectEnd()){
      state.playhead=projectEnd();
      await previewTimelineAt(state.playhead,false);
      stopTimelinePlayback();
      return;
    }

    const activeVideos=videoClipsAtTime(state.playhead);
    const c=activeVideos[0]||null;
    const secondary=activeVideos[1]||null;
    if(c){
      const currentId=state.activeTimelineClipId;
      const transitionNeedsRefresh=Boolean(secondary)!==(transitionVideo.style.display!=='none')||(secondary&&transitionVideo.dataset.clipId!==secondary.id);
      if(currentId!==c.id || v.style.display==='none'||transitionNeedsRefresh){
        await previewTimelineAt(state.playhead,true);
        if(!ownsPlayback()){state.timelineTimer=null;return}
      }else{
        const expected=previewSourceTime(c,state.playhead);
        if(Math.abs((v.currentTime||0)-expected)>.35){
          try{v.currentTime=expected}catch{}
        }
        v.playbackRate=Math.max(.25,Math.min(4,c.speed||1));
        v.volume=Math.max(0,Math.min(1,c.volume??1))*Math.max(0,Math.min(1,+$('masterVolume').value||1));
        v.style.opacity=String(previewClipOpacity(c,state.playhead));
        if(v.paused){try{await v.play()}catch{}}
        if(!ownsPlayback()){state.timelineTimer=null;return}
        if(secondary&&transitionVideo.dataset.clipId===secondary.id){
          const transitionExpected=previewSourceTime(secondary,state.playhead);
          if(Math.abs((transitionVideo.currentTime||0)-transitionExpected)>.35){try{transitionVideo.currentTime=transitionExpected}catch{}}
          transitionVideo.playbackRate=Math.max(.25,Math.min(4,secondary.speed||1));
          transitionVideo.style.opacity=String(previewClipOpacity(secondary,state.playhead));
          if(transitionVideo.paused){try{await transitionVideo.play()}catch{}}
          if(!ownsPlayback()){state.timelineTimer=null;return}
        }
        applyPreviewFx(c,secondary);
        await syncExternalTimelineAudio(state.playhead,true);
        if(!ownsPlayback()){state.timelineTimer=null;return}
        updateOverlayPreview();renderPlayhead();
        updateTimelineTimeReadout();
      }
    }else{
      v.pause();transitionVideo.pause();v.style.display='none';transitionVideo.style.display='none';
      const activeAudio=audioClipsAtTime(state.playhead);
      await syncExternalTimelineAudio(state.playhead,true);
      if(!ownsPlayback()){state.timelineTimer=null;return}
      if(activeAudio.length){
        const first=activeAudio[0],media=state.media.find(m=>m.id===first.mediaId);
        $('previewEmpty').style.display='none';
        $('audioTimelineVisual').style.display='grid';
        $('audioVisualTitle').textContent=first.name;
        $('audioVisualSub').textContent=`AUDIO TRACK • ${fmt(state.playhead)} / ${fmt(projectEnd())}`;
        $('audioLargeWave').style.backgroundImage=media?.waveform?`url("${waveformSvg(media.waveform)}")`:'none';
        $('previewBadge').textContent='TIMELINE • AUDIO';
      }else{
        $('audioTimelineVisual').style.display='none';
        $('previewEmpty').style.display='';
        $('previewEmpty').innerHTML='<b>Timeline gap</b><br>Playback continues to the next clip.';
        $('previewBadge').textContent='TIMELINE GAP';
      }
      updateOverlayPreview();renderPlayhead();updateTimelineTimeReadout();
    }

    if(ownsPlayback())state.timelineTimer=requestAnimationFrame(tick);
    else state.timelineTimer=null;
  }

  if(ownsPlayback())state.timelineTimer=requestAnimationFrame(tick);
}


$('playPause').onclick=async()=>{
  if(!state.timelinePreview){
    const el=activePreview();
    if(!el||el.style.display==='none')return notify('Preview a media file first.');
    if(el.paused){try{await el.play()}catch{notify('Playback could not start.')}}else el.pause();
    return;
  }
  if(hasTimeline()){
    if(state.timelinePlaying)stopTimelinePlayback();
    else await startTimelinePlayback();
    return;
  }
  notify('Add media to the timeline or preview a Media Bin item.');
};
$('toStart').onclick=async()=>{
  stopTimelinePlayback();
  state.playhead=0;
  if(hasTimeline())await previewTimelineAt(0,false);
  else{
    const el=activePreview();
    if(el&&el.style.display!=='none')el.currentTime=0;
    $('scrub').value=0;updateTransport();renderPlayhead();
  }
};
async function previewScrubPosition(t,final=false){
  state.playhead=Math.max(0,Math.min(hasTimeline()?projectEnd():Number($('scrub').max)||0,t));
  renderPlayhead();
  if(hasTimeline())updateTimelineTimeReadout();
  else{
    const el=activePreview();
    $('timeReadout').textContent=`${fmt(state.playhead)} / ${fmt(Number(el?.duration)||0)}`;
  }

  if(state.scrubPreviewTimer)clearTimeout(state.scrubPreviewTimer);
  const run=async()=>{
    if(hasTimeline()){
      await previewTimelineAt(state.playhead,false);
    }else{
      const el=activePreview();
      if(el&&el.style.display!=='none'){
        try{el.currentTime=state.playhead}catch{}
      }
    }
  };
  if(final)await run();
  else state.scrubPreviewTimer=setTimeout(run,70);
}
$('scrub').addEventListener('pointerdown',()=>{
  state.scrubbing=true;
  if(state.timelinePlaying)stopTimelinePlayback();
  const el=activePreview();if(el&&!el.paused)el.pause();
});
$('scrub').addEventListener('input',e=>previewScrubPosition(+e.target.value,false));
$('scrub').addEventListener('change',async e=>{
  await previewScrubPosition(+e.target.value,true);
  state.scrubbing=false;
});
$('scrub').addEventListener('pointerup',async e=>{
  await previewScrubPosition(+e.target.value,true);
  state.scrubbing=false;
});
$('scrub').addEventListener('pointercancel',()=>{state.scrubbing=false});
$('muteBtn').onclick=()=>{
  state.previewMuted=!state.previewMuted;
  v.muted=state.previewMuted;a.muted=state.previewMuted;
  for(const player of timelineAudioPlayers.values())player.muted=state.previewMuted;
  $('muteBtn').textContent=state.previewMuted?'🔇':'🔊';
};
$('previewFullscreen').onclick=()=>{const p=$('previewPanel');if(document.fullscreenElement)document.exitFullscreen();else p.requestFullscreen?.()};
$('settingsTop').onclick=()=>{openInspector('settings');$('inspectorBody')?.scrollTo?.({top:0,behavior:'smooth'});};

$('engineSelfTest').onclick=async()=>{
  const box=$('engineStatus');
  box.className='status warn';
  box.textContent='Checking desktop bridge, FFmpeg and FFprobe...';
  if(!window.emxDesktop?.available){
    box.textContent='FAIL: Native Electron bridge is unavailable. Run RUN-DESKTOP-DEV.bat or the packaged EXE.';
    return;
  }
  try{
    const r=await window.emxDesktop.healthCheck();
    if(r.ffmpeg&&r.ffprobe){
      box.className='status good';
      box.textContent=`PASS • ${r.ffmpegVersion} • ${r.ffprobeVersion}`;
    }else{
      box.textContent=`FAIL • FFmpeg: ${r.ffmpeg?'OK':r.ffmpegError} • FFprobe: ${r.ffprobe?'OK':r.ffprobeError}`;
    }
  }catch(err){
    box.textContent=`FAIL: ${err?.message||err}`;
  }
};



let contextClipId=null;
function hideClipContext(){$('clipContext').classList.remove('show');contextClipId=null}
function showClipContext(c,x,y){
  contextClipId=c.id;
  const menu=$('clipContext');
  const separate=menu.querySelector('[data-action="separate"]');
  const mute=menu.querySelector('[data-action="mute"]');
  const freeze=menu.querySelector('[data-action="freeze"]');
  if(separate)separate.style.display=c.type==='video'?'block':'none';
  if(mute)mute.style.display=c.type==='effect'?'none':'block';
  if(freeze)freeze.style.display=c.type==='video'&&!c.isFreeze?'block':'none';
  menu.style.visibility='hidden';
  menu.classList.add('show');
  requestAnimationFrame(()=>{
    const w=menu.offsetWidth||245,h=menu.offsetHeight||320,pad=8;
    menu.style.left=`${Math.max(pad,Math.min(window.innerWidth-w-pad,x))}px`;
    menu.style.top=`${Math.max(pad,Math.min(window.innerHeight-h-pad,y))}px`;
    menu.style.visibility='visible';
  });
}
function playheadInside(c){
  return state.playhead>c.start+.02 && state.playhead<c.start+clipTimelineDuration(c)-.02;
}
function trimStartToPlayhead(c){
  if(!playheadInside(c))return notify('Move the playhead inside this clip first.');
  pushHistory('Trim clip start');
  const source=previewSourceTime(c,state.playhead);
  c.trimStart=Math.min(c.trimEnd-.05,source);
  c.start=state.playhead;
  renderTimeline();updateInspector();previewTimelineAt(state.playhead,false);
}
function trimEndToPlayhead(c){
  if(!playheadInside(c))return notify('Move the playhead inside this clip first.');
  pushHistory('Trim clip end');
  c.trimEnd=Math.max(c.trimStart+.05,previewSourceTime(c,state.playhead));
  renderTimeline();updateInspector();previewTimelineAt(state.playhead,false);
}

function freezeFrameAtPlayhead(c){
  if(c.type!=='video'||c.isFreeze)return notify('Freeze Frame requires a normal video clip.','warn');
  const split=splitClipAtTime(c,state.playhead,uid());
  if(!split)return notify('Move the playhead inside the video clip before creating a freeze frame.','warn');
  const holdDuration=2;
  pushHistory('Create freeze frame');
  const originalTransition={transitionOut:c.transitionOut,transitionDuration:c.transitionDuration};
  Object.assign(c,split.first,{transitionOut:'none',transitionDuration:.45});
  state.videoClips.filter(other=>other.id!==c.id&&other.start>=state.playhead-.001).forEach(other=>{other.start+=holdDuration});
  const second={...split.second,start:state.playhead+holdDuration,...originalTransition};
  const freeze={
    ...c,id:uid(),name:`${c.name} • Freeze`,isFreeze:true,freezeSourceTime:split.first.trimEnd,
    start:state.playhead,trimStart:0,trimEnd:holdDuration,duration:600,speed:1,volume:0,fadeIn:0,fadeOut:0,
    transitionOut:'none',transitionDuration:.45,transitionIn:0,transitionInStyle:'none'
  };
  state.videoClips.push(freeze,second);state.videoClips.sort((a,b)=>a.start-b.start);
  state.selectedClipIds=new Set([freeze.id]);state.selectedClipId=freeze.id;state.clipSelectionAnchorId=freeze.id;
  renderTimeline();updateInspector();previewTimelineAt(state.playhead,false);
  notify('2-second freeze frame inserted. Drag or trim it to change timing.','success');
}

async function separateAudioFromClip(c){
  if(c.type!=='video')return;
  const media=state.media.find(m=>m.id===c.mediaId);
  if(!media)return;
  const extracted=await doExtract(media.id,{selectAfter:false});
  if(!extracted)return;
  pushHistory('Separate audio');
  const ac={
    id:uid(),mediaId:extracted.id,file:extracted.file,nativePath:extracted.nativePath||'',
    name:extracted.name,type:'audio',start:c.start,trimStart:c.trimStart,trimEnd:Math.min(c.trimEnd,extracted.duration),
    speed:c.speed,volume:c.volume,fadeIn:c.fadeIn||0,fadeOut:c.fadeOut||0,duration:extracted.duration,thumb:null,waveform:extracted.waveform
  };
  state.audioClips.push(ac);state.audioClips.sort((a,b)=>a.start-b.start);
  c.volume=0;
  state.selectedClipIds=new Set([ac.id]);state.selectedClipId=ac.id;state.clipSelectionAnchorId=ac.id;
  renderTimeline();updateInspector();previewTimelineAt(state.playhead,false);
  notify('Audio separated to editable AUDIO track');
}

$('clipContext').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-action]');if(!btn)return;
  const c=findClip(contextClipId);hideClipContext();if(!c)return;
  const action=btn.dataset.action;
  if(action==='split')splitSelected();
  if(action==='trim-start')trimStartToPlayhead(c);
  if(action==='trim-end')trimEndToPlayhead(c);
  if(action==='freeze')freezeFrameAtPlayhead(c);
  if(action==='move-playhead'){
    pushHistory('Move clip to playhead');
    c.start=Math.max(0,state.playhead);clipCollectionForType(c.type).sort((a,b)=>a.start-b.start);
    renderTimeline();updateInspector();previewTimelineAt(state.playhead,false);
  }
  if(action==='duplicate')$('duplicateClip').click();
  if(action==='delete')deleteSelected();
  if(action==='separate')await separateAudioFromClip(c);
  if(action==='mute'){pushHistory('Mute clip');c.volume=c.volume>0?0:1;renderTimeline();updateInspector();previewTimelineAt(state.playhead,false)}
});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#clipContext'))hideClipContext()});
document.addEventListener('scroll',hideClipContext,true);

function splitSelected(){
  if(selectedTimelineClips().length>1)return notify('Split works on one clip at a time. Select a single timeline clip first.','warn');
  const c=findClip(state.selectedClipId);if(!c)return notify('Select a timeline clip first.');
  const result=splitClipAtTime(c,state.playhead,uid());
  if(!result)return notify('Move the playhead inside the selected clip first.');
  pushHistory('Split clip');
  Object.assign(c,result.first);
  const arr=clipCollectionForType(c.type);
  arr.push(result.second);arr.sort((a,b)=>a.start-b.start);
  state.selectedClipIds=new Set([result.second.id]);state.selectedClipId=result.second.id;state.clipSelectionAnchorId=result.second.id;
  renderTimeline();updateInspector();previewTimelineAt(state.playhead,false);notify('Clip split');
}
$('splitBtn').onclick=splitSelected;$('splitHead').onclick=splitSelected;

$('closeGapsBtn').onclick=()=>{
  pushHistory('Close gaps');
  let cursor=0;
  state.videoClips.sort((a,b)=>a.start-b.start).forEach(c=>{
    c.start=cursor;
    cursor+=clipTimelineDuration(c);
  });
  state.fitTimeline=true;
  $('fitTimelineBtn').classList.add('primary');
  state.playhead=Math.min(state.playhead,projectEnd());
  renderTimeline();
  previewTimelineAt(state.playhead,false);
  notify('Video gaps closed');
};

async function selectImportMedia(){
  if(!window.emxDesktop?.available){
    $('filePicker').click();
    return;
  }
  try{
    const result=await window.emxDesktop.selectImportMedia();
    if(result?.canceled)return;
    const added=await addMediaItems(result?.items||[]);
    if(added.length)notify(`${added.length} selected media file(s) imported`,'success');
  }catch(error){
    notify(String(error?.message||error),'error','Import Failed');
  }
}
$('importMedia').onclick=selectImportMedia;
$('filePicker').onchange=async e=>{await addFiles([...e.target.files]);e.target.value=''};
$('addSelectedMedia').onclick=addSelectedMediaToTimeline;
$('removeSelectedMedia').onclick=()=>removeMediaItems([...state.selectedMediaIds]);
$('filterAll').onclick=()=>{mediaFilter='all';renderMedia()};$('filterVideo').onclick=()=>{mediaFilter='video';renderMedia()};$('filterAudio').onclick=()=>{mediaFilter='audio';renderMedia()};$('filterImage').onclick=()=>{mediaFilter='image';renderMedia()};
$('mediaSearch').oninput=event=>{mediaSearch=event.target.value;renderMedia()};
$('mediaSort').onchange=event=>{mediaSort=event.target.value;renderMedia()};
$('mediaThumbSize').oninput=event=>{state.mediaThumbnailSize=Number(event.target.value)||132;renderMedia()};
function setMediaView(view){
  state.mediaView=view;
  [['mediaGrid','grid'],['mediaCompact','compact'],['mediaListView','list']].forEach(([id,value])=>$(id).classList.toggle('active',value===view));
  renderMedia();
}
$('mediaGrid').onclick=()=>setMediaView('grid');
$('mediaCompact').onclick=()=>setMediaView('compact');
$('mediaListView').onclick=()=>setMediaView('list');
document.querySelectorAll('.resource-tab').forEach(tab=>tab.onclick=()=>{
  const resource=tab.dataset.resource;
  mediaFilter=resource==='audio'?'audio':'all';
  document.querySelectorAll('.resource-tab').forEach(button=>button.classList.toggle('active',button===tab));
  renderMedia();
});

let pendingFolderPath='';
function closeFolderMode(){pendingFolderPath='';$('folderModeModal').classList.remove('show')}
function openFolderMode(folderPath){
  pendingFolderPath=folderPath;
  const shortName=folderPath.split(/[\\/]/).filter(Boolean).at(-1)||folderPath;
  $('folderModePath').textContent=`${shortName}: import every supported clip now, or remember it as the folder opened by Import Media.`;
  $('folderModeModal').classList.add('show');
}
async function chooseClipsFolder(){
  if(!window.emxDesktop?.available){
    if(!window.showDirectoryPicker)return notify('Folder browsing requires the desktop app. Use Import Media instead.','warn');
    try{
      const handle=await window.showDirectoryPicker({mode:'read'}),files=[];
      for await(const entry of handle.values()){
        if(entry.kind!=='file')continue;
        const file=await entry.getFile();
        if(file.type.startsWith('video/')||file.type.startsWith('audio/'))files.push(file);
      }
      await addFiles(files);
      notify(`Loaded ${files.length} file(s) from folder`,'success');
    }catch(error){if(error?.name!=='AbortError')notify('Could not open that folder.','error')}
    return;
  }
  try{
    const result=await window.emxDesktop.chooseImportFolder();
    if(!result?.canceled&&result?.folderPath)openFolderMode(result.folderPath);
  }catch(error){notify(String(error?.message||error),'error','Folder Selection Failed')}
}
$('openFolder').onclick=chooseClipsFolder;
$('folderModeCancel').onclick=closeFolderMode;
$('folderImportAll').onclick=async()=>{
  const folderPath=pendingFolderPath;
  if(!folderPath)return closeFolderMode();
  setButtonBusy($('folderImportAll'),true,'IMPORTING…');
  try{
    const result=await window.emxDesktop.importFolderMedia(folderPath);
    const added=await addMediaItems(result?.items||[]);
    closeFolderMode();
    notify(added.length?`${added.length} supported clip(s) imported`:'No supported media files were found directly in that folder.',added.length?'success':'warn');
  }catch(error){notify(String(error?.message||error),'error','Folder Import Failed')}
  finally{setButtonBusy($('folderImportAll'),false)}
};
$('folderSetDefault').onclick=async()=>{
  const folderPath=pendingFolderPath;
  if(!folderPath)return closeFolderMode();
  setButtonBusy($('folderSetDefault'),true,'SAVING…');
  try{
    const result=await window.emxDesktop.setDefaultImportFolder(folderPath);
    state.settings.defaultImportFolder=result?.folderPath||folderPath;
    $('importMedia').title=`Import Media (opens in ${state.settings.defaultImportFolder})`;
    closeFolderMode();
    notify('Default import folder saved. Import Media now opens there for selective multi-file import.','success');
  }catch(error){notify(String(error?.message||error),'error','Folder Setting Failed')}
  finally{setButtonBusy($('folderSetDefault'),false)}
};
window.emxDesktop?.getImportLocation?.().then(result=>{
  if(!result?.defaultImportFolder)return;
  state.settings.defaultImportFolder=result.defaultImportFolder;
  $('importMedia').title=`Import Media (opens in ${state.settings.defaultImportFolder})`;
}).catch(()=>{});


const nativeJobs=new Map();
if(window.emxDesktop?.available&&window.emxDesktop.onJobEvent){
  window.emxDesktop.onJobEvent(evt=>{
    const job=nativeJobs.get(evt.jobId);
    if(!job)return;
    if(evt.type==='progress'&&job.onProgress)job.onProgress(evt.progress||0);
    if(evt.type==='log'&&job.onLog)job.onLog(evt.log||'');
    if(evt.type==='status'&&job.onStatus)job.onStatus(evt.message||'');
    if(evt.type==='complete'&&job.onStatus)job.onStatus(evt.message||'Complete');
  });
}
function withNativeJob(jobId,handlers){nativeJobs.set(jobId,handlers);return()=>nativeJobs.delete(jobId)}
function bytesFromIpc(data){
  if(data instanceof Uint8Array)return data;
  if(data?.data&&Array.isArray(data.data))return new Uint8Array(data.data);
  if(Array.isArray(data))return new Uint8Array(data);
  return new Uint8Array(data||[]);
}

function setRenderStage(stage){
  document.querySelectorAll('#renderStages span').forEach(s=>{
    const order={prepare:0,process:1,verify:2,done:3};
    s.classList.toggle('active',order[s.dataset.stage]<=order[stage]);
    s.classList.toggle('current',s.dataset.stage===stage);
  });
}
function openRender(status,title='EMX Render Engine'){
  state.renderBusy=true;state.renderStartedAt=Date.now();
  $('renderTitle').textContent=title;
  $('renderModal').classList.add('show');
  $('renderModalCard').className='modal render-modal working';
  $('renderStatus').textContent=status;
  $('renderProgress').style.width='0%';
  $('renderPercent').textContent='0%';
  $('renderLog').textContent='';
  $('renderSpinner').style.display='block';
  $('renderCompleteIcon').style.display='none';
  $('renderResult').hidden=true;
  $('openExportVideo').hidden=true;
  $('openExportFolder').hidden=true;
  $('renderHint').textContent='Keep EMX Clip Studio open while this finishes.';
  $('closeRender').disabled=true;
  setRenderStage('prepare');
  clearInterval(openRender.timer);
  openRender.timer=setInterval(()=>{
    const sec=Math.floor((Date.now()-state.renderStartedAt)/1000);
    $('renderElapsed').textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
  },500);
}
function finishRender(ok,message){
  state.renderBusy=false;
  clearInterval(openRender.timer);
  $('renderSpinner').style.display='none';
  $('renderCompleteIcon').style.display=ok?'grid':'none';
  $('closeRender').disabled=false;
  $('renderModalCard').className=`modal render-modal ${ok?'success':'failure'}`;
  $('renderStatus').textContent=message;
  if(ok){setProgress(1);setRenderStage('done')}
}
function closeRender(){if(state.renderBusy)return notify('This operation is still running.','warn');$('renderModal').classList.remove('show')}
function setProgress(p){
  const pct=Math.max(0,Math.min(100,Math.round((p||0)*100)));
  $('renderProgress').style.width=`${pct}%`;
  $('renderPercent').textContent=`${pct}%`;
  if(pct>=3&&pct<94)setRenderStage('process');
  if(pct>=94)setRenderStage('verify');
}
function setLog(x){state.ffmpegLog=x;$('renderLog').textContent=x}
function setRenderStatus(msg){
  $('renderStatus').textContent=msg;
  const m=String(msg||'').toLowerCase();
  if(m.includes('verif')||m.includes('probe'))setRenderStage('verify');
  else if(m.includes('render')||m.includes('extract')||m.includes('separat')||m.includes('process'))setRenderStage('process');
}
$('closeRender').onclick=closeRender;
$('openExportVideo').onclick=async()=>{
  if(!state.lastExportPath)return;
  try{await window.emxDesktop.openPath(state.lastExportPath)}
  catch(error){notify(String(error?.message||error),'error','Could Not Open Export')}
};
$('openExportFolder').onclick=async()=>{
  if(!state.lastExportPath)return;
  try{await window.emxDesktop.revealInExplorer(state.lastExportPath)}
  catch(error){notify(String(error?.message||error),'error','Could Not Open Export Folder')}
};

async function doExtract(id,{selectAfter=true}={}){
  const m=state.media.find(x=>x.id===id);
  if(!m||m.type!=='video')return;
  if(!window.emxDesktop?.available)return notify('Audio extraction requires the EMX desktop app.');
  if(!m.nativePath)return notify('No desktop path found. Re-import this clip in the desktop app.');

  const jobId=uid();
  setButtonBusy($('extractSelected'),true,'EXTRACTING…');
  setTopTask('EXTRACTING AUDIO…',null,'working');
  openRender('Checking audio stream...','EMX Audio Extraction');
  const cleanup=withNativeJob(jobId,{
    onProgress:setProgress,
    onLog:setLog,
    onStatus:setRenderStatus
  });

  try{
    const result=await window.emxDesktop.extractAudio({jobId,inputPath:m.nativePath,baseName:m.name});
    if(!result?.ok)throw new Error('Audio extraction did not complete.');
    const bytes=bytesFromIpc(result.data);
    const file=new File([bytes],result.name,{type:result.mime||'audio/mp4'});
    const added=await addFiles([{file,nativePath:result.path}]);
    const extracted=added[0]||null;
    if(selectAfter&&extracted)await selectMedia(extracted.id,false);
    finishRender(true,'Audio extraction verified');
    setTopTask('AUDIO EXTRACTION COMPLETE',1,'done');
    notify('Audio extracted and verified','success');
    setTimeout(closeRender,650);
    return extracted;
  }catch(err){
    finishRender(false,'Audio extraction failed');
    setTopTask('AUDIO EXTRACTION FAILED',1,'error');
    setLog(String(err?.message||err));
    notify(String(err?.message||err),'error','Audio Extraction Failed');
    return null;
  }finally{
    cleanup();
    setButtonBusy($('extractSelected'),false);
  }
}
$('extractSelected').onclick=async()=>{if(!state.selectedMediaId)return notify('Select a video in Media Bin first.');await doExtract(state.selectedMediaId)};
$('duplicateClip').onclick=()=>{
  const c=findClip(state.selectedClipId);if(!c)return;
  pushHistory('Duplicate clip');
  const cp={...c,id:uid(),start:c.start+clipTimelineDuration(c)+.1};
  clipCollectionForType(c.type).push(cp);
  state.selectedClipIds=new Set([cp.id]);state.selectedClipId=cp.id;state.clipSelectionAnchorId=cp.id;
  renderTimeline();updateInspector();previewTimelineAt(state.playhead,false);
};
function deleteSelected(){
  const clips=selectedTimelineClips();
  if(!clips.length)return;
  const ids=new Set(clips.map(clip=>clip.id));
  pushHistory(clips.length===1?'Delete clip':`Delete ${clips.length} clips`);
  stopTimelinePlayback();
  for(const id of ids){
    const player=timelineAudioPlayers.get(id);
    if(player){player.pause();timelineAudioPlayers.delete(id)}
  }
  state.videoClips=state.videoClips.filter(clip=>!ids.has(clip.id));
  state.audioClips=state.audioClips.filter(clip=>!ids.has(clip.id));
  state.overlayClips=state.overlayClips.filter(clip=>!ids.has(clip.id));
  state.effectClips=state.effectClips.filter(clip=>!ids.has(clip.id));
  state.selectedClipIds=new Set();state.selectedClipId=null;state.clipSelectionAnchorId=null;
  state.playhead=Math.min(state.playhead,projectEnd());
  renderTimeline();updateInspector();previewTimelineAt(state.playhead,false);
  notify(clips.length===1?'Clip removed':'Selected clips removed');
}
$('deleteClip').onclick=deleteSelected;
$('newProject').onclick=()=>{
  stopTimelinePlayback();
  state.videoClips=[];state.audioClips=[];state.overlayClips=[];state.effectClips=[];state.selectedClipIds=new Set();state.selectedClipId=null;state.clipSelectionAnchorId=null;state.playhead=0;state.activeTimelineClipId=null;state.history=[];state.future=[];
  $('timelineModeBadge').style.display='none';
  renderTimeline();updateTransport();notify('Timeline cleared');
};
$('addVideoTrack').onclick=()=>{const m=state.media.find(x=>x.id===state.selectedMediaId&&x.type==='video');if(!m)return notify('Select a video first.');addClip(m.id,'video')};
$('addAudioTrack').onclick=()=>{const m=state.media.find(x=>x.id===state.selectedMediaId&&x.type==='audio');if(!m)return notify('Select audio first.');addClip(m.id,'audio')};
$('addOverlayTrack').onclick=()=>{const m=state.media.find(x=>x.id===state.selectedMediaId&&x.type==='image');if(!m)return notify('Select an image in Resources first.');addClip(m.id,'overlay')};

function setupLaneDrop(laneId,trackType){
  const lane=$(laneId);
  lane.addEventListener('dragover',e=>{
    const mediaType=e.dataTransfer.getData('application/x-emx-media-type');
    if(mediaType&&!trackAcceptsMedia(trackType,{type:mediaType}))return;
    e.preventDefault();
    e.dataTransfer.dropEffect='copy';
    lane.classList.add('drop-ready');
  });
  lane.addEventListener('dragleave',()=>lane.classList.remove('drop-ready'));
  lane.addEventListener('drop',e=>{
    e.preventDefault();
    lane.classList.remove('drop-ready');
    const id=e.dataTransfer.getData('application/x-emx-media-id')||e.dataTransfer.getData('text/plain');
    const media=state.media.find(x=>x.id===id);
    if(!media)return;
    if(!trackAcceptsMedia(trackType,media)){
      notify(`Drop ${media.type} media onto the matching ${trackType.toUpperCase()} track.`);
      return;
    }
    const rect=lane.getBoundingClientRect();
    let start=Math.max(0,(e.clientX-rect.left)/Math.max(1,state.pxPerSec));
    const duration=trackType==='overlay'?5:media.duration;
    const phantom={id:'new',start,trimStart:0,trimEnd:duration,speed:1};
    const arr=clipCollectionForType(trackType);
    start=arr.length===0?0:magneticStart(start,phantom,arr);
    addClip(media.id,trackType,start);
    notify(`${media.name} added to ${trackType.toUpperCase()} track`);
  });
}
setupLaneDrop('videoLane','video');
setupLaneDrop('audioLane','audio');
setupLaneDrop('overlayLane','overlay');

function setupEffectLaneDrop(){
  const lane=$('effectLane');
  lane.addEventListener('dragover',event=>{
    if(![...event.dataTransfer.types].includes('application/x-emx-effect-id'))return;
    event.preventDefault();event.dataTransfer.dropEffect='copy';lane.classList.add('drop-ready');
  });
  lane.addEventListener('dragleave',()=>lane.classList.remove('drop-ready'));
  lane.addEventListener('drop',event=>{
    event.preventDefault();lane.classList.remove('drop-ready');
    const effectId=event.dataTransfer.getData('application/x-emx-effect-id');
    if(!effectDefinition(effectId))return;
    const rect=lane.getBoundingClientRect();
    const start=Math.max(0,(event.clientX-rect.left)/Math.max(1,state.pxPerSec));
    addEffectClip(effectId,start);
  });
}
setupEffectLaneDrop();

function setupTimelineSeek(element){
  element.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.target.closest('.clip'))return;
    const lane=e.currentTarget;
    const rect=lane.getBoundingClientRect();
    const t=Math.max(0,(e.clientX-rect.left)/Math.max(1,state.pxPerSec));
    stopTimelinePlayback();
    previewTimelineAt(Math.min(projectEnd(),t),false);
  });
}
setupTimelineSeek($('videoLane'));
setupTimelineSeek($('audioLane'));
setupTimelineSeek($('overlayLane'));
setupTimelineSeek($('effectLane'));

function timelineTimeFromClientX(clientX){
  const canvasRect=$('timelineCanvas').getBoundingClientRect();
  return bounded((clientX-canvasRect.left-90)/Math.max(1,state.pxPerSec),0,projectEnd(),0);
}
let playheadPreviewFrame=0;
function dragPlayheadTo(clientX,final=false){
  state.playhead=timelineTimeFromClientX(clientX);
  state.timelinePreview=true;renderPlayhead();updateTimelineTimeReadout();
  if(final){
    if(playheadPreviewFrame){cancelAnimationFrame(playheadPreviewFrame);playheadPreviewFrame=0}
    previewTimelineAt(state.playhead,false);
    return;
  }
  if(!playheadPreviewFrame)playheadPreviewFrame=requestAnimationFrame(()=>{
    playheadPreviewFrame=0;previewTimelineAt(state.playhead,false);
  });
}
const timelinePlayhead=$('playhead');
timelinePlayhead.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  event.preventDefault();event.stopPropagation();stopTimelinePlayback();
  timelinePlayhead.classList.add('dragging');timelinePlayhead.setPointerCapture(event.pointerId);
  dragPlayheadTo(event.clientX);
});
timelinePlayhead.addEventListener('pointermove',event=>{
  if(timelinePlayhead.hasPointerCapture(event.pointerId))dragPlayheadTo(event.clientX);
});
function finishPlayheadDrag(event){
  if(!timelinePlayhead.hasPointerCapture(event.pointerId))return;
  try{timelinePlayhead.releasePointerCapture(event.pointerId)}catch{}
  timelinePlayhead.classList.remove('dragging');dragPlayheadTo(event.clientX,true);
}
timelinePlayhead.addEventListener('pointerup',finishPlayheadDrag);
timelinePlayhead.addEventListener('pointercancel',event=>{
  timelinePlayhead.classList.remove('dragging');
  if(timelinePlayhead.hasPointerCapture(event.pointerId)){try{timelinePlayhead.releasePointerCapture(event.pointerId)}catch{}}
});




$('exportBtn').onclick=async()=>{
  if(!state.videoClips.length)return notify('Add at least one video clip to timeline.');
  if(!window.emxDesktop?.available)return notify('MP4 export requires the EMX desktop app.');

  const missing=[...state.videoClips,...state.audioClips].filter(c=>!c.nativePath);
  if(missing.length){
    openRender('Export preflight failed');
    setLog(`No desktop file path is available for: ${missing.map(c=>c.name).join(', ')}\nRe-import those files in the desktop app.`);
    return;
  }

  const jobId=uid();
  setButtonBusy($('exportBtn'),true,'EXPORTING…');
  setTopTask('EXPORTING MP4…',0,'working');
  openRender('Preflight: checking media and native FFmpeg...','EMX MP4 Export');
  const cleanup=withNativeJob(jobId,{
    onProgress:p=>{setProgress(p);setTopTask(`EXPORTING MP4 • ${Math.round((p||0)*100)}%`,p,'working')},
    onLog:setLog,
    onStatus:setRenderStatus
  });

  try{
    const result=await window.emxDesktop.exportProject({
      jobId,
      suggestedName:`EMX_Clip_${new Date().toISOString().replace(/[:.]/g,'-')}.mp4`,
      project:{
        videoClips:state.videoClips.map(c=>({
          id:c.id,name:c.name,path:c.nativePath,start:c.start,trimStart:c.trimStart,trimEnd:c.trimEnd,speed:c.speed,volume:c.volume,
          fadeIn:c.fadeIn,fadeOut:c.fadeOut,visual:clipVisual(c),transitionOut:c.transitionOut,transitionDuration:c.transitionDuration,transitionIn:c.transitionIn,transitionInStyle:c.transitionInStyle,
          isFreeze:Boolean(c.isFreeze),freezeSourceTime:c.freezeSourceTime
        })),
        audioClips:state.audioClips.map(c=>({
          id:c.id,name:c.name,path:c.nativePath,start:c.start,trimStart:c.trimStart,trimEnd:c.trimEnd,speed:c.speed,volume:c.volume,fadeIn:c.fadeIn,fadeOut:c.fadeOut
        })),
        overlayClips:state.overlayClips.map(c=>({
          id:c.id,name:c.name,path:c.nativePath,start:c.start,trimStart:c.trimStart,trimEnd:c.trimEnd,speed:1,
          opacity:c.opacity,scale:c.scale,position:c.position,visual:clipVisual(c)
        })),
        effectClips:state.effectClips.map(c=>({
          id:c.id,effectId:c.effectId,name:effectClipLabel(c),start:c.start,trimStart:c.trimStart,trimEnd:c.trimEnd,speed:1
        })),
        effects:{...state.effects},
        branding:{...state.branding},
        export:{...state.export}
      }
    });
    if(result?.canceled){
      $('renderStatus').textContent='Export canceled';
      closeRender();
      return;
    }
    if(!result?.ok)throw new Error('Native export did not complete.');
    state.lastExportPath=result.outputPath;
    finishRender(true,'MP4 export verified');
    setTopTask('MP4 EXPORT COMPLETE',1,'done');
    setLog(`Saved: ${result.outputPath}\nSize: ${(result.size/1024/1024).toFixed(1)} MB\nDuration: ${Number(result.duration||0).toFixed(2)}s`);
    $('renderOutputName').textContent=String(result.outputPath||'').split(/[\\/]/).pop()||'EMX export';
    $('renderOutputPath').textContent=result.outputPath;
    $('renderOutputMeta').textContent=`${(result.size/1024/1024).toFixed(1)} MB • ${Number(result.duration||0).toFixed(2)} seconds • verified MP4`;
    $('renderResult').hidden=false;
    $('openExportVideo').hidden=false;
    $('openExportFolder').hidden=false;
    $('renderHint').textContent='Export complete. Play it now or open its dedicated folder.';
    notify('MP4 exported and verified','success');
  }catch(err){
    finishRender(false,'Export failed');
    setTopTask('MP4 EXPORT FAILED',1,'error');
    setLog(String(err?.message||err));
    notify(String(err?.message||err),'error','Export Failed');
  }finally{
    cleanup();
    setButtonBusy($('exportBtn'),false);
  }
};

const stems=getStemEngineStatus();

function selectedAudioSource(){
  const clip=findClip(state.selectedClipId);
  if(clip){
    const media=state.media.find(m=>m.id===clip.mediaId);
    if(media)return {media,clip};
  }
  const media=state.media.find(m=>m.id===state.selectedMediaId);
  return media?{media,clip:null}:null;
}
function updateAiModeNote(){
  const notes={
    'remove-voices':'AI separates vocals from the remaining audio. The cleaned non-vocal result is returned as a new audio file.',
    'game-focus':'Experimental: separates vocals/drums/bass/other, removes vocals, then creates a game-focused mix that favors the Other/effects stem while reducing music-heavy stems.',
    'four-stem':'Creates editable Vocals, Drums, Bass and Other files.',
    'denoise':'Uses native FFmpeg noise reduction for steady hiss/fan/background noise. No AI runtime is required.'
  };
  $('aiModeNote').textContent=notes[$('aiMode').value]||'';
}
$('aiMode').onchange=updateAiModeNote;
updateAiModeNote();

async function refreshAiStatus(){
  if(!window.emxDesktop?.available){
    $('aiStatus').className='status warn';
    $('aiStatus').textContent='Desktop bridge unavailable.';
    return false;
  }
  try{
    const s=await window.emxDesktop.aiStatus();
    $('aiStatus').className=s.installed?'status good':'status warn';
    if(s.installed){
      const source=s.source==='bundled'?'BUNDLED / OFFLINE':s.source==='managed'?'EMX MANAGED / FRIEND READY':'LOCAL';
      $('aiStatus').textContent=`READY • ${source} • ${s.version||'Audio Separator'}`;
      return true;
    }
    $('aiStatus').textContent='PREPARING • EMX will set up Audio AI automatically in the background.';
    return false;
  }catch(err){
    $('aiStatus').className='status warn';
    $('aiStatus').textContent=`Audio AI status error: ${err?.message||err}`;
    return false;
  }
}
$('aiRefreshBtn').onclick=refreshAiStatus;

async function autoEnsureAiReady({showUi=false,repair=false}={}){
  if(!window.emxDesktop?.available)return false;
  const existing=await refreshAiStatus();
  if(existing&&!repair)return true;

  const jobId=uid();
  if(showUi){
    openRender(repair?'Repairing private EMX Audio AI runtime…':'Preparing private EMX Audio AI runtime…','EMX Audio AI');
  }
  setTopTask(repair?'REPAIRING AUDIO AI…':'PREPARING AUDIO AI…',null,'working');
  const cleanup=withNativeJob(jobId,{
    onProgress:p=>{
      if(showUi)setProgress(p);
      setTopTask(`AUDIO AI • ${Math.round((p||0)*100)}%`,p,'working');
    },
    onLog:l=>{if(showUi)setLog(l)},
    onStatus:m=>{
      $('aiStatus').className='status warn';
      $('aiStatus').textContent=m;
      if(showUi)setRenderStatus(m);
    }
  });

  try{
    const result=repair
      ? await window.emxDesktop.aiRepair({jobId})
      : await window.emxDesktop.aiEnsure({jobId});
    if(!result?.ok)throw new Error(result?.error||'Audio AI preparation did not complete.');
    $('aiStatus').className='status good';
    $('aiStatus').textContent=`READY • ${result.source==='bundled'?'BUNDLED / OFFLINE':'EMX MANAGED / FRIEND READY'} • ${result.version||'Audio Separator'}`;
    setTopTask('AUDIO AI READY',1,'done');
    if(showUi){
      finishRender(true,'Audio AI ready');
      setTimeout(closeRender,650);
      notify('EMX Audio AI is ready','success');
    }
    return true;
  }catch(err){
    $('aiStatus').className='status warn';
    $('aiStatus').textContent=`Audio AI unavailable: ${err?.message||err}`;
    setTopTask('AUDIO AI NEEDS ATTENTION',1,'error');
    if(showUi){
      finishRender(false,'Audio AI preparation failed');
      setLog(String(err?.message||err));
      notify(String(err?.message||err),'error','Audio AI');
    }
    return false;
  }finally{
    cleanup();
  }
}

$('aiRepairBtn').onclick=async()=>{
  setButtonBusy($('aiRepairBtn'),true,'REPAIRING…');
  try{await autoEnsureAiReady({showUi:true,repair:true})}
  finally{setButtonBusy($('aiRepairBtn'),false)}
};

async function addAiOutput(output){
  const bytes=bytesFromIpc(output.data);
  const file=new File([bytes],output.name,{type:output.mime||'audio/wav'});
  const added=await addFiles([{file,nativePath:output.path}]);
  return added[0]||null;
}

$('aiProcessBtn').onclick=async()=>{
  const source=selectedAudioSource();
  if(!source)return notify('Select a Media Bin item or timeline clip first.','warn');
  if(!source.media.nativePath)return notify('Re-import this media in the desktop app so EMX has a native path.','warn');
  if(!window.emxDesktop?.available)return notify('Audio AI requires the desktop app.','warn');

  const mode=$('aiMode').value;
  if(mode!=='denoise'){
    const ready=await refreshAiStatus();
    if(!ready)return notify('EMX Audio AI is still preparing. Try again when the status shows READY.','warn');
  }

  const jobId=uid();
  setButtonBusy($('aiProcessBtn'),true,'PROCESSING…');
  setTopTask('PROCESSING AUDIO…',0,'working');
  openRender(mode==='denoise'?'Reducing background noise…':'Loading source-separation model…','EMX Audio AI');
  const cleanup=withNativeJob(jobId,{
    onProgress:p=>{setProgress(p);setTopTask(`AUDIO AI • ${Math.round((p||0)*100)}%`,p,'working')},
    onLog:setLog,
    onStatus:setRenderStatus
  });

  try{
    const result=await window.emxDesktop.aiProcess({
      jobId,inputPath:source.media.nativePath,baseName:source.media.name,mode
    });
    if(!result?.ok)throw new Error(result?.error||'Audio processing did not complete.');
    const outputs=[];
    for(const out of result.outputs||[]){
      const media=await addAiOutput(out);
      if(media)outputs.push(media);
    }
    if(!outputs.length)throw new Error('Audio processing completed but returned no output files.');

    if($('aiAfter').value==='align'&&source.clip){
      pushHistory('Add processed audio');
      let cursorStart=source.clip.start;
      for(const media of outputs){
        if(mode==='four-stem' && !/other|drums|bass|vocals/i.test(media.name))continue;
        const c={
          id:uid(),mediaId:media.id,file:media.file,nativePath:media.nativePath||'',name:media.name,type:'audio',
          start:cursorStart,trimStart:0,trimEnd:media.duration,speed:1,volume:1,fadeIn:0,fadeOut:0,
          duration:media.duration,thumb:null,waveform:media.waveform
        };
        state.audioClips.push(c);
      }
      state.audioClips.sort((a,b)=>a.start-b.start);
      if($('aiMuteOriginal').value==='on'&&source.clip.type==='video')source.clip.volume=0;
      state.timelinePreview=true;
      renderTimeline();updateInspector();await previewTimelineAt(state.playhead,false);
    }

    finishRender(true,'Audio processing verified');
    setTopTask('AUDIO PROCESSING COMPLETE',1,'done');
    notify(`${outputs.length} processed audio file(s) added`,'success');
  }catch(err){
    finishRender(false,'Audio processing failed');
    setTopTask('AUDIO PROCESSING FAILED',1,'error');
    setLog(String(err?.message||err));
    notify(String(err?.message||err),'error','Audio AI Failed');
  }finally{
    cleanup();setButtonBusy($('aiProcessBtn'),false);
  }
};

function formatBytes(value){
  const bytes=Math.max(0,Number(value)||0);
  if(bytes<1024)return `${Math.round(bytes)} B`;
  const units=['KB','MB','GB'];let size=bytes/1024,index=0;
  while(size>=1024&&index<units.length-1){size/=1024;index++}
  return `${size.toFixed(size>=100?0:1)} ${units[index]}`;
}
function formatUpdateDate(value){
  if(!value)return 'Never';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Never':date.toLocaleString();
}
function renderUpdateState(update){
  if(!update)return;
  const status=$('updateStatus');
  const progress=update.progress||{};
  const percent=Math.max(0,Math.min(100,Number(progress.percent)||0));
  const active=['CHECKING FOR UPDATE','DOWNLOADING','VERIFYING','INSTALLING','RESTARTING'].includes(update.status);
  status.className=`status ${['UPDATE FAILED','OFFLINE'].includes(update.status)?'warn':'good'}`;
  status.textContent=`${update.status||'READY'} • ${update.message||'Ready.'}`;
  $('updateCurrentVersion').textContent=update.currentVersion||'—';
  $('updateLatestVersion').textContent=update.latestVersion||'—';
  $('updateChannel').textContent=update.channel||'latest';
  $('updateLastChecked').textContent=formatUpdateDate(update.lastCheckedAt);
  $('updateSigning').textContent=update.signing||'unknown';
  $('appVersionLabel').textContent=`Desktop Timeline Editor • V${update.currentVersion||'1.9.0'}`;
  $('updateProgress').style.width=`${percent}%`;
  $('updateProgressText').textContent=update.status==='DOWNLOADING'
    ? `${percent.toFixed(1)}% • ${formatBytes(progress.transferred)} / ${formatBytes(progress.total)} • ${formatBytes(progress.bytesPerSecond)}/s`
    : active?'Working…':'No download in progress.';
  const notes=$('updateNotes');
  notes.hidden=!update.releaseNotes;
  notes.textContent=update.releaseNotes?`Release notes\n${update.releaseNotes}`:'';
  $('checkUpdatesBtn').disabled=!update.configured||active||update.status==='READY TO INSTALL';
  $('downloadUpdateBtn').disabled=update.status!=='UPDATE AVAILABLE';
  $('installUpdateBtn').disabled=update.status!=='READY TO INSTALL';
  const indicator=$('updateIndicator');
  const showIndicator=['UPDATE AVAILABLE','DOWNLOADING','READY TO INSTALL'].includes(update.status);
  indicator.hidden=!showIndicator;
  indicator.textContent=update.status==='UPDATE AVAILABLE'&&update.latestVersion?`UPDATE AVAILABLE • V${update.latestVersion}`:update.status;
}
async function hydrateUpdateCenter(){
  if(!window.emxDesktop?.available){
    renderUpdateState({status:'OFFLINE',currentVersion:'1.11.2',channel:'latest',configured:false,message:'Update Center requires the desktop application.',progress:{}});
    return;
  }
  try{renderUpdateState(await window.emxDesktop.updateStatus())}
  catch(error){renderUpdateState({status:'UPDATE FAILED',currentVersion:'1.11.2',channel:'latest',configured:false,message:String(error?.message||error),progress:{}})}
}
if(window.emxDesktop?.available&&window.emxDesktop.onUpdateEvent){window.emxDesktop.onUpdateEvent(renderUpdateState)}
function notifyManualUpdateCheck(update){
  const current=update?.currentVersion||'current';
  const latest=update?.latestVersion||current;
  if(update?.status==='UP TO DATE'){
    notify(`EMX Clip Studio V${current} is already up to date.`, 'success', 'Update Center');
  }else if(update?.status==='UPDATE AVAILABLE'){
    notify(`Version ${latest} is ready to download.`, 'success', 'Update Center');
  }else if(update?.status==='OFFLINE'){
    notify(update.message||'The update feed is unavailable.', 'warn', 'Update Center');
  }else if(update?.status==='UPDATE FAILED'){
    notify(update.message||'The update check failed.', 'error', 'Update Center');
  }
}
$('checkUpdatesBtn').onclick=async()=>{
  if(!window.emxDesktop?.available)return notify('Update Center requires the desktop application.', 'warn', 'Update Center');
  try{
    const update=await window.emxDesktop.checkForUpdates();
    renderUpdateState(update);
    notifyManualUpdateCheck(update);
  }catch(error){
    const update={status:'UPDATE FAILED',message:String(error?.message||error),progress:{}};
    renderUpdateState(update);
    notifyManualUpdateCheck(update);
  }
};
$('downloadUpdateBtn').onclick=async()=>{try{renderUpdateState(await window.emxDesktop.downloadUpdate())}catch(error){renderUpdateState({status:'UPDATE FAILED',message:String(error?.message||error),progress:{}})}};
$('installUpdateBtn').onclick=()=>window.emxDesktop?.installUpdate?.();
$('updateIndicator').onclick=()=>{openInspector('updates');$('inspectorBody')?.scrollTo?.({top:0,behavior:'smooth'})};
autoEnsureAiReady({showUi:false});

function openInspector(name){
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.inspector===name));
  ['clip','effects','filters','transitions','branding','audio','export','updates','settings'].forEach(n=>$('ins'+n[0].toUpperCase()+n.slice(1)).style.display=n===name?'block':'none');
  if(name==='effects'||name==='filters'||name==='transitions')updateVisualLibraryState();
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>openInspector(t.dataset.inspector)));

document.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea'))return;
  if(e.code==='Space'){e.preventDefault();$('playPause').click()}
  if((e.ctrlKey&&e.key.toLowerCase()==='b')||e.key.toLowerCase()==='s'){e.preventDefault();splitSelected()}
  if(e.ctrlKey&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();undo()}
  if((e.ctrlKey&&e.key.toLowerCase()==='y')||(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='z')){e.preventDefault();redo()}
  if(e.key==='Delete'){e.preventDefault();deleteSelected()}
});
$('mediaList').addEventListener('dblclick',async e=>{
  const item=e.target.closest('.media-item');
  if(!item)return;
  const preview=item.querySelector('[data-preview]');
  if(preview)await selectMedia(preview.dataset.preview,true);
});

document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer?.files?.length)addFiles([...e.dataTransfer.files])});


setTimeout(async()=>{
  if(!window.emxDesktop?.available){
    $('exportEngineStatus').className='status warn';
    $('exportEngineStatus').textContent='Native desktop engine unavailable. Use Electron dev mode or the packaged EXE.';
    return;
  }
  try{
    const r=await window.emxDesktop.healthCheck();
    if(r.ffmpeg&&r.ffprobe){
      $('exportEngineStatus').className='status good';
      $('exportEngineStatus').textContent='Native FFmpeg + FFprobe detected and ready.';
    }else{
      $('exportEngineStatus').className='status warn';
      $('exportEngineStatus').textContent='Native media engine failed preflight. Open Settings → Run Engine Self-Test.';
    }
  }catch{
    $('exportEngineStatus').className='status warn';
    $('exportEngineStatus').textContent='Could not verify native media engine.';
  }
},400);

renderMedia();renderTimeline();updateInspector();updateTransport();syncBrandingControls();updateHistoryButtons();hydrateUpdateCenter();
