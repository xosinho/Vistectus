/* =====================================================================
   VISTECTUS — D&D — the Quest Board (shared script)
   ---------------------------------------------------------------------
   One copy for every campaign. A campaign's quest-board/index.html
   holds the markup and loads, in this order: its data files
   (../assets/data/npcs.js, maps.js, documents.js), supabase-js,
   builders/config.js, gate.js, then this file. The campaign is read
   from <body data-campaign="<campaign id>">.

   A tavern's notice board for the party: notices of people, places and
   handouts nailed to the wood, leads and notes, twine between them,
   chalked-out sections, pictures. Made from the Vampire chronicle's
   Intrigue Board; saved boards use the same format.

   Online:
   - Boards are kept in the case_files table (chronicle = campaign id),
     every Save a new numbered version. The database decides who may
     save and delete: board_editor(<campaign id>) in admin/sql/access.sql
     (every member of the campaign, players and Dungeon Master).
   - Pictures go to the public 'case-photos' bucket under
     '<campaign id>/<sha-256>.<ext>'; the storage policy checks the
     first folder with board_editor(<campaign id>).
   - The Person / Place / Handout pickers offer the campaign's NPCs,
     Maps and Handouts minus whatever the Dungeon Master has hidden
     (archive_hidden). If that list cannot be read, nothing is offered.
   ===================================================================== */
(function(){
  "use strict";

  /* ================= the campaign ================= */
  var CHRONICLE = (document.body.getAttribute('data-campaign') || '').trim();
  var VALID_CAMPAIGN = /^[a-z0-9][a-z0-9-]{0,79}$/.test(CHRONICLE);
  /* DEFAULT_BOARD is the board this page opens with. It is stored with
     every save, so do not rename it once boards have been saved. */
  var DEFAULT_BOARD = 'quests', DEFAULT_NAME = 'Quest Board';
  var CASE_TABLE = 'case_files', PHOTO_BUCKET = 'case-photos';
  var db = null;        // the gate's Supabase client, once it has let us in
  var session = null;

  /* ================= constants ================= */
  var ICONS = {
    person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
    place: '<svg viewBox="0 0 24 24"><path d="M12 2C7.6 2 4 5.7 4 10.2 4 16 12 22 12 22s8-6 8-11.8C20 5.7 16.4 2 12 2z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    faction: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3.2v5.6c0 5.4-3.6 9.6-8 11.2-4.4-1.6-8-5.8-8-11.2V5.2z"/></svg>',
    event: '<svg viewBox="0 0 24 24"><path d="M12 2l2.4 6.9H21l-5.8 4.3 2.3 7-5.5-4.3-5.5 4.3 2.3-7L3 8.9h6.6z"/></svg>',
    comment: '<svg viewBox="0 0 24 24"><path d="M4 4h16v12H7l-3 3V4z"/></svg>',
    photo: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5-5L7 18"/></svg>',
    document: '<svg viewBox="0 0 24 24"><path d="M5 4c2 0 2 2 4 2h10v14H9c-2 0-2-2-4-2z"/><path d="M5 4v14M11 10h6M11 14h6"/></svg>',
    evidence: '<svg viewBox="0 0 24 24"><path d="M4 20l7-7M13 4l7 7-3 3-7-7z"/><path d="M9 9l6 6"/></svg>'
  };
  /* The keys are the ones the Intrigue Board saves ('document' and
     'evidence' among them), so a board can move between the two; only
     the words are the party's. */
  var TYPE_META = {
    person:  {label:'Person',  hex:'#c9a35c'},
    place:   {label:'Place',   hex:'#5c8a76'},
    faction: {label:'Faction', hex:'#a3272b'},
    event:   {label:'Event',   hex:'#5b6f8a'},
    comment: {label:'Note',    hex:'#b5953a'},
    photo:   {label:'Picture', hex:'#6b7a5a'},
    document:{label:'Handout', hex:'#8a6a3a'},
    evidence:{label:'Lead',    hex:'#7a5a8a'}
  };
  /* The Satchel's tabs. Person, Place and Handout pick from the
     campaign's NPCs, Maps and Handouts; Lead and Note are post-its.
     Faction, Event and Picture notices still display if a board has
     them. */
  var TYPE_ORDER = ['person','place','document','evidence','comment'];
  var PICKERS = { person: 'npcs', place: 'maps', document: 'documents' };
  var ZONE_PALETTE = ['#b8935a','#5c8a76','#a3272b','#5b6f8a','#8a5aa8','#c97a3a'];
  var CARD_W = 172, CARD_H = 112;
  var CARD_MIN_W = 140, CARD_MIN_H = 90, CARD_MAX_W = 440, CARD_MAX_H = 440;

  /* ================= state ================= */
  var state = null; // {slug, boardName, version, elements, offboard, sections, links, photos}
  var dirty = false;
  var selectedType = 'person';
  var zoneMode = false;
  /* The zoom label calls ZOOM_BASE of the board's true size 100%. The
     board opens at 200% (ZOOM_START), zooms out to 35% and in to 800%.
     Notice positions and sizes are unaffected, so saved boards open as
     they were. */
  var ZOOM_BASE = 0.175;
  var ZOOM_START = ZOOM_BASE * 2;
  var zoom = ZOOM_START;
  var ZOOM_MIN = ZOOM_BASE * 0.35, ZOOM_MAX = ZOOM_BASE * 8, ZOOM_STEP = 0.1;
  var BOARD_W = 24000, BOARD_H = 15600;

  function $(id){ return document.getElementById(id); }
  var boardEl = $('board');
  var boardWrap = $('boardWrap');
  var boardScaler = $('boardScaler');
  var cardsLayer = $('cardsLayer');
  var sectionsLayer = $('sectionsLayer');
  var svg = $('strings');
  var zonePreview = $('zonePreview');
  var offboardList = $('offboardList');

  /* ================= helpers ================= */
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function hexToRgba(hex, alpha){
    var h = hex.replace('#','');
    var r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  function slugify(s){
    return (s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-+|-+$)/g,'').slice(0,80) || 'board-' + uid();
  }
  /* A picture's src ends up inside an <img> tag. Only an image embedded
     in the file, or a plain path to an image, is allowed through:
     anything else in a loaded board could smuggle markup or script into
     the page. */
  function safeImageSrc(src){
    src = String(src == null ? '' : src);
    if(/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+\/=\s]+$/i.test(src)) return src;
    if(/^(https?:\/\/[\w.-]+)?[\w\-.\/%]+\.(png|jpe?g|gif|webp)$/i.test(src)) return src;
    return '';
  }
  /* Section colours go into a style attribute: the same rule applies. */
  function safeColor(c){
    return /^#[0-9a-f]{6}$/i.test(String(c)) ? c : ZONE_PALETTE[0];
  }
  function escapeHtml(s){
    return String(s==null?'':s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function markDirty(){ dirty = true; $('dirtyDot').style.display = 'inline-block'; }
  function clearDirty(){ dirty = false; $('dirtyDot').style.display = 'none'; }
  function toast(msg){
    var t = $('toast');
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(function(){ t.style.display = 'none'; }, 2600);
  }
  function showLoading(on, msg){
    $('loadingText').textContent = msg || 'Working…';
    $('loadingOverlay').style.display = on ? 'flex' : 'none';
  }
  function showModal(html){
    var root = $('modalRoot');
    root.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
    $('modalBackdrop').addEventListener('mousedown', function(e){
      if(e.target.id === 'modalBackdrop') closeModal();
    });
  }
  function closeModal(){ $('modalRoot').innerHTML = ''; }
  function closeButton(){
    return '<div class="modal-actions"><button type="button" class="btn btn-ghost" id="modalClose">Close</button></div>';
  }
  function wireClose(){ var c = $('modalClose'); if(c) c.addEventListener('click', closeModal); }

  function boardPointFromEvent(ev){
    var r = boardEl.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / zoom, y: (ev.clientY - r.top) / zoom };
  }

  /* ================= zoom ================= */
  function applyZoom(){
    boardEl.style.transform = 'scale(' + zoom + ')';
    boardScaler.style.width = (BOARD_W * zoom) + 'px';
    boardScaler.style.height = (BOARD_H * zoom) + 'px';
    $('zoomLabel').textContent = Math.round(zoom / ZOOM_BASE * 100) + '%';
  }
  /* Zoom so the board point under (clientX, clientY) stays put: the
     pointer for the wheel, the middle of the view for the buttons. */
  function zoomTo(z, clientX, clientY){
    z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    if(z === zoom) return;
    var r = boardWrap.getBoundingClientRect();
    var ox = (clientX == null) ? boardWrap.clientWidth / 2 : clientX - r.left;
    var oy = (clientY == null) ? boardWrap.clientHeight / 2 : clientY - r.top;
    var bx = (boardWrap.scrollLeft + ox) / zoom, by = (boardWrap.scrollTop + oy) / zoom;
    zoom = z;
    applyZoom();
    boardWrap.scrollLeft = bx * zoom - ox;
    boardWrap.scrollTop = by * zoom - oy;
  }
  // The buttons step by 10% of the label, landing on round figures.
  function zoomStep(d){
    var shown = Math.round((zoom / ZOOM_BASE + d) * 10) / 10;
    zoomTo(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, shown * ZOOM_BASE)));
  }
  function zoomIn(){ zoomStep(ZOOM_STEP); }
  function zoomOut(){ zoomStep(-ZOOM_STEP); }
  function zoomReset(){ zoomTo(ZOOM_START); }

  /* ================= online boards =================
     Every Save is kept online as a new numbered version; nothing is
     ever overwritten, and Open lists every saved version. Pictures are
     uploaded when a board is saved, so each version holds links to
     them, not copies. */
  function withTimeout(promise, ms){
    return new Promise(function(resolve, reject){
      var settled = false;
      var timer = setTimeout(function(){
        if(!settled){ settled = true; reject(new Error('The server took too long to answer.')); }
      }, ms);
      Promise.resolve(promise).then(function(v){
        if(!settled){ settled = true; clearTimeout(timer); resolve(v); }
      }, function(err){
        if(!settled){ settled = true; clearTimeout(timer); reject(err); }
      });
    });
  }
  function errText(e){ return (e && e.message) ? e.message : String(e); }

  function exportState(){
    return {
      name: state.boardName, version: state.version,
      elements: state.elements, offboard: state.offboard,
      sections: state.sections, links: state.links,
      photos: state.photos || []
    };
  }
  function blankCase(board, name){
    return {slug: board, boardName: name, version: 0, elements: [], offboard: [], sections: [], links: [], photos: []};
  }
  function confirmDiscard(){
    return !dirty || window.confirm('The open board has unsaved changes. Discard them?');
  }
  function fmtDate(iso){
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString(undefined, {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'});
  }

  function notConnected(){
    showModal(
      '<h3>Not connected</h3>' +
      '<p class="hint">Online saving is not available just now, so nothing can be saved or opened. You can still work on the board, but it is lost when this tab closes.</p>' +
      closeButton()
    );
    wireClose();
  }

  /* ---------------- accounts ---------------- */
  async function currentSession(){
    if(!db) return null;
    try{ return (await db.auth.getSession()).data.session; }
    catch(e){ console.error(e); return null; }
  }

  /* Who may save and delete is decided by the database (board_editor in
     admin/sql/access.sql): the campaign's players and its Dungeon
     Master. The page asks the same question only to decide what to
     offer. */
  var canEdit = false;
  var EDITORS_TEXT = "Only the campaign's players and its Dungeon Master can save or delete boards. You can still open and read every saved version.";
  async function checkEditor(){
    canEdit = false;
    if(!db || !session) return;
    try{
      var r = await withTimeout(db.rpc('board_editor', { p_chronicle: CHRONICLE }), 10000);
      canEdit = !r.error && r.data === true;
    }catch(e){ console.error(e); }
  }

  /* The gate signs everyone in before the board shows, so this only
     appears if the session ran out while the board was open. */
  function openSignIn(){
    showModal(
      '<h3>Sign in to save</h3>' +
      '<p class="hint">Saving is for the party and the Dungeon Master. Enter your email and a sign-in link will be sent to it. Keep this tab open: after using the link, come back here and press Save again.</p>' +
      '<form id="signInForm">' +
        '<input id="signInEmail" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Email" required/>' +
        '<p class="hint" id="signInMsg" role="status"></p>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-ghost" id="modalClose">Cancel</button>' +
          '<button type="submit" class="btn btn-primary" id="signInSend">Send link</button>' +
        '</div>' +
      '</form>'
    );
    wireClose();
    $('signInEmail').focus();
    $('signInForm').addEventListener('submit', async function(e){
      e.preventDefault();
      var email = $('signInEmail').value.trim();
      var msg = $('signInMsg');
      var send = $('signInSend');
      send.disabled = true;
      msg.textContent = 'Sending…';
      try{
        var r = await withTimeout(db.auth.signInWithOtp({
          email: email,
          options: { shouldCreateUser: true, emailRedirectTo: window.location.href.split('#')[0] }
        }), 15000);
        if(r.error) throw r.error;
        msg.textContent = 'Link sent. Check your email, use the link, then come back to this tab and save.';
      }catch(err){
        console.error(err);
        msg.textContent = /not been invited|sign ?ups? not allowed|not found|invalid login|hook/i.test(errText(err))
          ? 'That email has not been added to this campaign. Ask your Dungeon Master to add it.'
          : 'Could not send the link: ' + errText(err);
        send.disabled = false;
      }
    });
  }

  async function toggleAccount(){
    if(!db) return notConnected();
    if(!session) return openSignIn();
    if(!window.confirm('Sign out' + (session.user && session.user.email ? ' ' + session.user.email : '') + '?' +
      (dirty ? ' The open board has unsaved changes, and they will be lost.' : ''))) return;
    dirty = false;   // the page reloads to the sign-in box; the question has been asked
    await db.auth.signOut();
  }

  /* ---------------- reading ---------------- */
  // Every saved version in this campaign, grouped by board, newest first.
  async function fetchCaseList(){
    var r = await withTimeout(
      db.from(CASE_TABLE).select('board,name,version,created_at')
        .eq('chronicle', CHRONICLE).order('created_at', {ascending: false}).limit(2000),
      10000);
    if(r.error) throw r.error;
    var files = {}, order = [];
    (r.data || []).forEach(function(row){
      if(!files[row.board]){ files[row.board] = {board: row.board, name: row.name, versions: []}; order.push(row.board); }
      files[row.board].versions.push(row);
    });
    return order.map(function(b){ return files[b]; });
  }

  async function latestVersion(board){
    var r = await withTimeout(
      db.from(CASE_TABLE).select('version').eq('chronicle', CHRONICLE).eq('board', board)
        .order('version', {ascending: false}).limit(1),
      10000);
    if(r.error) throw r.error;
    return (r.data && r.data[0]) ? r.data[0].version : 0;
  }

  // Opens one version, or the latest when none is given. False if there is none.
  async function loadCase(board, version){
    var q = db.from(CASE_TABLE).select('name,version,data').eq('chronicle', CHRONICLE).eq('board', board);
    q = version ? q.eq('version', version) : q.order('version', {ascending: false}).limit(1);
    var r = await withTimeout(q, 15000);
    if(r.error) throw r.error;
    var row = r.data && r.data[0];
    if(!row) return false;
    var data = row.data;
    if(!data || typeof data !== 'object' || !Array.isArray(data.elements)){
      throw new Error('That version is damaged and cannot be opened.');
    }
    function list(x){ return Array.isArray(x) ? x : []; }
    state = {
      slug: board, boardName: row.name, version: row.version,
      elements: data.elements, offboard: list(data.offboard),
      sections: list(data.sections), links: list(data.links), photos: list(data.photos)
    };
    clearDirty();
    renderAll();
    return true;
  }

  async function openCase(board, version){
    if(!confirmDiscard()) return;
    showLoading(true, 'Taking the board down from the wall…');
    try{
      if(await loadCase(board, version)) toast('Opened "' + state.boardName + '" — V' + state.version);
      else alert('That version could not be found.');
    }catch(e){
      console.error(e);
      alert('Could not open that board:\n' + errText(e));
    }finally{
      showLoading(false);
    }
  }

  /* ---------------- the Open dialog ---------------- */
  async function openLoadModal(){
    if(!db) return notConnected();
    showLoading(true, 'Gathering the boards…');
    var files = null;
    try{ files = await fetchCaseList(); }
    catch(e){ console.error(e); }
    showLoading(false);

    var rows = '';
    (files || []).forEach(function(f){
      var opts = f.versions.map(function(v, i){
        return '<option value="' + escapeHtml(v.version) + '"' + (i === 0 ? ' selected' : '') + '>V' + escapeHtml(v.version) +
               ' · ' + escapeHtml(fmtDate(v.created_at)) + '</option>';
      }).join('');
      rows += '<div class="load-row" data-board="' + escapeHtml(f.board) + '">' +
        '<div class="load-row-name">' + escapeHtml(f.name) + '</div>' +
        '<select class="load-version" aria-label="Version of ' + escapeHtml(f.name) + '">' + opts + '</select>' +
        '<button type="button" class="btn btn-small btn-primary load-open">Open</button>' +
        (canEdit ? '<button type="button" class="btn btn-small btn-danger load-delete" title="Delete this board and every saved version">Delete</button>' : '') +
      '</div>';
    });
    var statusLine = '';
    if(files === null){
      statusLine = '<p class="hint">Could not reach the saved boards just now. <button type="button" class="link-btn" id="modalRetry">Try again</button>.</p>';
    }else if(!rows){
      rows = '<p class="hint">No boards saved yet. Save the open board to keep it here.</p>';
    }
    showModal(
      '<h3>Quest Boards</h3>' +
      '<p class="hint">Every save is kept. Pick a board and a version to open.' + (canEdit ? '' : ' ' + EDITORS_TEXT) + '</p>' +
      statusLine +
      '<div class="load-list">' + rows + '</div>' +
      '<hr class="modal-divider"/>' +
      '<button type="button" class="btn btn-ghost btn-block" id="modalNew">＋ New Board</button>' +
      closeButton()
    );
    $('modalNew').addEventListener('click', function(){ closeModal(); newBoard(); });
    wireClose();
    var retryEl = $('modalRetry');
    if(retryEl){ retryEl.addEventListener('click', function(){ closeModal(); openLoadModal(); }); }
    document.querySelectorAll('.load-open').forEach(function(btn){
      btn.addEventListener('click', function(e){
        var row = e.target.closest('.load-row');
        var v = parseInt(row.querySelector('.load-version').value, 10);
        closeModal();
        openCase(row.dataset.board, v);
      });
    });
    document.querySelectorAll('.load-delete').forEach(function(btn){
      btn.addEventListener('click', function(e){
        var row = e.target.closest('.load-row');
        var name = row.querySelector('.load-row-name').textContent;
        if(window.confirm('Permanently delete "' + name + '" and every saved version of it? This cannot be undone.')){
          closeModal();
          deleteCase(row.dataset.board, name);
        }
      });
    });
  }

  /* ---------------- writing ---------------- */
  async function newBoard(){
    if(!confirmDiscard()) return;
    var name = window.prompt('Name this new board:');
    if(!name || !name.trim()) return;
    name = name.trim().slice(0,60);
    var board = slugify(name);
    if(db){
      // Two boards with one name would be impossible to tell apart in Open.
      try{
        var clash = (await fetchCaseList()).filter(function(f){ return f.board === board; })[0];
        if(clash){
          alert('There is already a board called "' + clash.name + '". Open it from Open…, or choose another name.');
          return;
        }
      }catch(e){
        console.error(e);
        board = board + '-' + uid().slice(-4);   // cannot check: at least never add to another board
      }
    }
    state = blankCase(board, name);
    clearDirty();
    renderAll();
    toast('Started "' + name + '" — Save keeps it online');
  }

  async function uploadPhoto(dataUrl){
    var blob = await (await fetch(dataUrl)).blob();
    var digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    var hash = Array.prototype.map.call(new Uint8Array(digest), function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
    var ext = {'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'}[blob.type] || 'jpg';
    /* Named after its contents: the same picture is only ever stored once.
       The campaign folder is what lets this campaign's party upload
       (the storage policy checks it), so keep it first in the path. */
    var path = CHRONICLE + '/' + hash + '.' + ext;
    var r = await withTimeout(db.storage.from(PHOTO_BUCKET).upload(path, blob, {
      contentType: blob.type || 'image/jpeg', upsert: false, cacheControl: '31536000'
    }), 30000);
    if(r.error && String(r.error.statusCode) !== '409' && !/exists|duplicate/i.test(errText(r.error))) throw r.error;
    return db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // Swap every picture still held in the page for its uploaded copy.
  async function uploadPhotos(){
    var holders = [].concat(state.elements, state.offboard, state.photos || []).filter(function(o){
      return o && typeof o.src === 'string' && o.src.indexOf('data:image/') === 0;
    });
    var done = {};
    for(var i = 0; i < holders.length; i++){
      var src = holders[i].src;
      if(!done[src]){
        showLoading(true, 'Uploading pictures… ' + (Object.keys(done).length + 1));
        done[src] = await uploadPhoto(src);
      }
      holders[i].src = done[src];
    }
  }

  async function saveBoard(){
    if(!state) return;
    if(!db) return notConnected();
    session = await currentSession();
    renderTopbar();
    if(!session) return openSignIn();
    await checkEditor();
    if(!canEdit){ alert(EDITORS_TEXT); return; }

    showLoading(true, 'Nailing it to the board…');
    try{
      await uploadPhotos();
      showLoading(true, 'Nailing it to the board…');
      var latest = await latestVersion(state.slug);
      if(latest > state.version){
        showLoading(false);
        var ok = window.confirm('V' + latest + ' of "' + state.boardName + '" was saved after ' +
          (state.version ? 'you opened V' + state.version : 'you started this board') +
          '. Save yours as V' + (latest + 1) + '? V' + latest + ' stays in the list.');
        if(!ok) return;
        showLoading(true, 'Nailing it to the board…');
      }
      var saved = 0;
      for(var attempt = 0; attempt < 3 && !saved; attempt++){
        var next = latest + 1;
        var data = exportState();
        data.version = next;
        // saved_by is filled in by the database (it defaults to the signed-in account).
        var r = await withTimeout(db.from(CASE_TABLE).insert({
          chronicle: CHRONICLE, board: state.slug, name: state.boardName, version: next, data: data
        }), 20000);
        if(!r.error){ saved = next; break; }
        if(r.error.code !== '23505') throw r.error;        // anything but "that number was just taken"
        latest = await latestVersion(state.slug);
      }
      if(!saved) throw new Error('Someone else is saving this board right now. Try again in a moment.');
      state.version = saved;
      clearDirty();
      renderAll();
      toast('Saved "' + state.boardName + '" as V' + saved);
    }catch(e){
      console.error(e);
      alert('Save failed:\n' + errText(e) + '\n\nYour work is still open in this window.');
    }finally{
      showLoading(false);
    }
  }

  async function deleteCase(board, name){
    showLoading(true, 'Taking the board down…');
    try{
      var r = await withTimeout(
        db.from(CASE_TABLE).delete().eq('chronicle', CHRONICLE).eq('board', board).select('id'), 15000);
      if(r.error) throw r.error;
      if(!r.data || !r.data.length) throw new Error('Nothing was deleted. Your account may not be allowed to delete boards.');
      if(state && state.slug === board){
        // The board stays open, now unsaved, so deleting by mistake loses nothing yet.
        state.version = 0;
        markDirty();
        renderTopbar();
      }
      toast('Deleted "' + name + '".');
    }catch(e){
      console.error(e);
      alert('Could not delete that board:\n' + errText(e));
    }finally{
      showLoading(false);
      openLoadModal();
    }
  }

  /* ================= rendering ================= */
  function updateControlsEnabled(){
    var has = !!(state && state.slug);
    ['btnZone','btnSave','btnAddOffboard'].forEach(function(id){
      $(id).disabled = !has;
    });
  }

  function renderTopbar(){
    $('boardTitle').textContent = state ? state.boardName : 'No Board Open';
    var acct = $('btnAccount');
    acct.style.display = db ? '' : 'none';
    acct.textContent = session ? 'Sign out' : 'Sign in';
    acct.title = (session && session.user) ? 'Signed in as ' + session.user.email : 'Sign in to save boards';
    updateControlsEnabled();
  }

  function getCardSize(el){
    var node = cardsLayer.querySelector('[data-id="' + CSS.escape(String(el.id)) + '"]');
    if(node){ return { w: node.offsetWidth, h: node.offsetHeight }; }
    return { w: el.w || CARD_W, h: el.h || CARD_H };
  }
  function pinPoint(el){
    var size = getCardSize(el);
    return { x: el.x + size.w/2, y: el.y + size.h + 7 };
  }

  var RESIZE_ICON = '<svg viewBox="0 0 14 14"><path d="M11 1L1 11M11 5L5 11M11 9L9 11" stroke="currentColor" stroke-width="1.4"/></svg>';
  var PIN_BTN = '<div class="card-pin" title="Drag to tie on twine"></div>';
  var RESIZE_BTN = '<div class="card-resize" title="Drag to resize">' + RESIZE_ICON + '</div>';
  var DEL_BTN = '<div class="card-del" title="Take down">✕</div>';

  function wireCardControls(card, el){
    card.querySelector('.card-del').addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    card.querySelector('.card-del').addEventListener('click', function(e){
      e.stopPropagation();
      var label = el.name || el.caption || (el.type === 'comment' ? 'this note' : 'this picture');
      if(window.confirm('Take "' + label + '" down from the board?')){
        state.elements = state.elements.filter(function(x){ return x.id !== el.id; });
        state.links = state.links.filter(function(l){ return l.from !== el.id && l.to !== el.id; });
        markDirty(); renderCards(); renderStrings();
      }
    });
    card.querySelector('.card-pin').addEventListener('pointerdown', function(e){
      e.stopPropagation(); e.preventDefault(); startLinkDrag(el, e);
    });
    card.querySelector('.card-resize').addEventListener('pointerdown', function(e){
      e.stopPropagation(); e.preventDefault(); startCardResize(el, card, e);
    });
    card.addEventListener('pointerdown', function(e){
      if(e.target.closest('.card-del') || e.target.closest('.card-pin') || e.target.closest('.card-resize') || e.target.closest('.card-open')) return;
      startCardDrag(el, card, e);
    });
  }

  function num(v, d){ v = Number(v); return isFinite(v) ? v : d; }

  function renderCards(){
    cardsLayer.innerHTML = '';
    if(!state) return;
    state.elements.forEach(function(el){
      var card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = el.id;
      card.style.left = num(el.x, 0) + 'px';
      card.style.top = num(el.y, 0) + 'px';

      if(el.type === 'comment'){
        card.className = 'card card-comment';
        card.style.width = num(el.w, CARD_W) + 'px';
        if(el.h) card.style.height = num(el.h, CARD_H) + 'px';
        card.style.setProperty('--tc', TYPE_META.comment.hex);
        card.innerHTML = DEL_BTN +
          '<div class="card-text">' + escapeHtml(el.text||'') + '</div>' +
          PIN_BTN + RESIZE_BTN;
        cardsLayer.appendChild(card);
        if(el.h){ card.querySelector('.card-text').style.overflow = 'auto'; }
        wireCardControls(card, el);

      } else if(el.type === 'document' && !el.src){
        // A handout that is not a picture: its title, and a way to read it.
        card.style.width = num(el.w, CARD_W) + 'px';
        if(el.h) card.style.height = num(el.h, CARD_H) + 'px';
        card.style.setProperty('--tc', TYPE_META.document.hex);
        var href = safeDocHref(el.href);
        card.innerHTML = DEL_BTN +
          '<div class="card-type">' + ICONS.document + '<span>' + TYPE_META.document.label + '</span></div>' +
          '<div class="card-name">' + escapeHtml(el.name||'') + '</div>' +
          (href ? '<a class="card-open" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">Read ↗</a>' : '') +
          PIN_BTN + RESIZE_BTN;
        cardsLayer.appendChild(card);
        var openEl = card.querySelector('.card-open');
        if(openEl) openEl.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
        wireCardControls(card, el);

      } else if(el.type === 'photo' || (el.src && PICKERS[el.type])){
        // Uploaded pictures, and the pictures of people, places and handouts.
        var typed = el.type !== 'photo';
        card.className = 'card card-photo' + (typed ? ' card-picked' : '');
        card.style.width = num(el.w, 200) + 'px';
        if(el.h) card.style.height = num(el.h, CARD_H) + 'px';
        card.style.setProperty('--tc', typed ? TYPE_META[el.type].hex : TYPE_META.photo.hex);
        card.innerHTML = DEL_BTN +
          (typed ? '<div class="card-type picked-type">' + ICONS[el.type] + '<span>' + TYPE_META[el.type].label + '</span></div>' : '') +
          '<img class="photo-img" src="' + escapeHtml(safeImageSrc(el.src)) + '" alt="' + escapeHtml(el.caption||'Picture') + '"/>' +
          (el.caption ? '<div class="photo-caption">' + escapeHtml(el.caption) + '</div>' : '') +
          PIN_BTN + RESIZE_BTN;
        cardsLayer.appendChild(card);
        wireCardControls(card, el);

      } else {
        var meta = TYPE_META[el.type] || TYPE_META.evidence;
        card.style.width = num(el.w, CARD_W) + 'px';
        if(el.h) card.style.height = num(el.h, CARD_H) + 'px';
        card.style.setProperty('--tc', meta.hex);
        card.innerHTML = DEL_BTN +
          '<div class="card-type">' + (ICONS[el.type] || ICONS.evidence) + '<span>' + meta.label + '</span></div>' +
          '<div class="card-name">' + escapeHtml(el.name||'') + '</div>' +
          (el.note ? '<div class="card-note">' + escapeHtml(el.note) + '</div>' : '') +
          PIN_BTN + RESIZE_BTN;
        cardsLayer.appendChild(card);
        var noteEl = card.querySelector('.card-note');
        if(noteEl){ noteEl.style.maxHeight = el.h ? 'none' : '80px'; updateNoteFill(noteEl); }
        wireCardControls(card, el);
      }
    });
  }

  function updateNoteFill(noteEl){
    if(!noteEl) return;
    noteEl.classList.remove('note-fill');
    var overflowing = noteEl.scrollHeight > noteEl.clientHeight + 1;
    noteEl.classList.toggle('note-fill', !overflowing);
  }

  function startCardResize(el, card, e){
    try{ card.setPointerCapture(e.pointerId); }catch(err){}
    var startX = e.clientX, startY = e.clientY;
    var origW = el.w || card.offsetWidth;
    var origH = el.h || card.offsetHeight;
    var noteEl = card.querySelector('.card-note');
    function onMove(ev){
      var dw = (ev.clientX - startX) / zoom, dh = (ev.clientY - startY) / zoom;
      el.w = Math.max(CARD_MIN_W, Math.min(CARD_MAX_W, origW + dw));
      el.h = Math.max(CARD_MIN_H, Math.min(CARD_MAX_H, origH + dh));
      card.style.width = el.w + 'px';
      card.style.height = el.h + 'px';
      if(noteEl){ noteEl.style.maxHeight = 'none'; updateNoteFill(noteEl); }
      scheduleStrings();
    }
    function onUp(){
      card.removeEventListener('pointermove', onMove);
      card.removeEventListener('pointerup', onUp);
      card.removeEventListener('pointercancel', onUp);
      markDirty();
    }
    card.addEventListener('pointermove', onMove);
    card.addEventListener('pointerup', onUp);
    card.addEventListener('pointercancel', onUp);
  }

  function startCardDrag(el, card, e){
    e.preventDefault();
    try{ card.setPointerCapture(e.pointerId); }catch(err){}
    var startX = e.clientX, startY = e.clientY, origX = num(el.x, 0), origY = num(el.y, 0);
    var moved = false;
    function onMove(ev){
      var dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
      if(Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      el.x = Math.max(0, origX + dx);
      el.y = Math.max(0, origY + dy);
      card.style.left = el.x + 'px';
      card.style.top = el.y + 'px';
      scheduleStrings();
    }
    function onUp(){
      card.removeEventListener('pointermove', onMove);
      card.removeEventListener('pointerup', onUp);
      card.removeEventListener('pointercancel', onUp);
      if(moved) markDirty();
    }
    card.addEventListener('pointermove', onMove);
    card.addEventListener('pointerup', onUp);
    card.addEventListener('pointercancel', onUp);
  }

  function startLinkDrag(sourceEl, e){
    var ns = 'http://www.w3.org/2000/svg';
    var temp = document.createElementNS(ns, 'path');
    temp.setAttribute('stroke', '#b5222a');
    temp.setAttribute('stroke-width', '2');
    temp.setAttribute('fill', 'none');
    temp.setAttribute('stroke-dasharray', '5 4');
    svg.appendChild(temp);
    var start = pinPoint(sourceEl);

    function draw(px, py){
      var mx = (start.x + px) / 2, my = (start.y + py) / 2 + 40;
      temp.setAttribute('d', 'M ' + start.x + ' ' + start.y + ' Q ' + mx + ' ' + my + ' ' + px + ' ' + py);
    }
    draw(start.x, start.y);

    function onMove(ev){
      var p = boardPointFromEvent(ev);
      draw(p.x, p.y);
    }
    /* The guide line may already be gone if the board redrew mid-drag:
       check before removing it. */
    function cleanup(){
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', cleanup);
      if(temp.parentNode) temp.parentNode.removeChild(temp);
    }
    function onUp(ev){
      cleanup();
      var targetCard = document.elementFromPoint(ev.clientX, ev.clientY);
      targetCard = targetCard && targetCard.closest ? targetCard.closest('.card') : null;
      if(targetCard && targetCard.dataset.id !== sourceEl.id){
        var targetId = targetCard.dataset.id;
        var already = state.links.some(function(l){
          return (l.from === sourceEl.id && l.to === targetId) || (l.from === targetId && l.to === sourceEl.id);
        });
        if(already){ toast('These two are already tied together.'); return; }
        var label = window.prompt('Label this length of twine (optional):', '') || '';
        state.links.push({ id: uid(), from: sourceEl.id, to: targetId, label: label.trim().slice(0, 80) });
        markDirty();
        renderStrings();
      }
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', cleanup);   // an interrupted touch
  }

  function confirmUntie(link){
    if(window.confirm('Untie this twine' + (link.label ? (' ("' + link.label + '")') : '') + '?')){
      state.links = state.links.filter(function(l){ return l.id !== link.id; });
      markDirty();
      renderStrings();
    }
  }

  function startLabelDrag(link, g, baseX, baseY){
    g.addEventListener('pointerdown', function(e){
      e.stopPropagation();
      e.preventDefault();
      try{ g.setPointerCapture(e.pointerId); }catch(err){}
      var startX = e.clientX, startY = e.clientY;
      var origDx = link.labelDx || 0, origDy = link.labelDy || 0;
      var moved = false;
      function onMove(ev){
        var ddx = (ev.clientX - startX) / zoom, ddy = (ev.clientY - startY) / zoom;
        if(Math.abs(ddx) + Math.abs(ddy) > 2) moved = true;
        link.labelDx = origDx + ddx;
        link.labelDy = origDy + ddy;
        g.setAttribute('transform', 'translate(' + (baseX + link.labelDx) + ',' + (baseY + link.labelDy) + ')');
      }
      function onUp(){
        g.removeEventListener('pointermove', onMove);
        g.removeEventListener('pointerup', onUp);
        g.removeEventListener('pointercancel', onUp);
        if(moved){
          markDirty();
          renderStrings();
        }else{
          confirmUntie(link);
        }
      }
      g.addEventListener('pointermove', onMove);
      g.addEventListener('pointerup', onUp);
      g.addEventListener('pointercancel', onUp);
    });
  }

  /* Dragging fires far more pointer events than the screen can show.
     Queue one redraw per frame instead of rebuilding every string on
     every event. */
  var stringsQueued = false;
  function scheduleStrings(){
    if(stringsQueued) return;
    stringsQueued = true;
    requestAnimationFrame(function(){ stringsQueued = false; renderStrings(); });
  }

  function renderStrings(){
    svg.innerHTML = '';
    if(!state) return;
    var ns = 'http://www.w3.org/2000/svg';
    var byId = {};
    state.elements.forEach(function(el){ byId[el.id] = el; });
    state.links.forEach(function(link){
      var a = byId[link.from], b = byId[link.to];
      if(!a || !b) return;
      var p1 = pinPoint(a), p2 = pinPoint(b);
      var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2 + Math.min(70, Math.abs(p1.x - p2.x) * 0.15 + 30);
      var d = 'M ' + p1.x + ' ' + p1.y + ' Q ' + mx + ' ' + my + ' ' + p2.x + ' ' + p2.y;

      var hit = document.createElementNS(ns, 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '14');
      hit.setAttribute('fill', 'none');
      hit.setAttribute('class', 'string-hit');
      hit.addEventListener('click', function(){ confirmUntie(link); });
      svg.appendChild(hit);

      var path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', '#8a1c1c');
      path.setAttribute('stroke-width', '2.4');
      path.setAttribute('fill', 'none');
      path.setAttribute('opacity', '0.92');
      svg.appendChild(path);

      [p1, p2].forEach(function(p){
        var tack = document.createElementNS(ns, 'circle');
        tack.setAttribute('cx', p.x); tack.setAttribute('cy', p.y); tack.setAttribute('r', 4.5);
        tack.setAttribute('fill', '#b5222a'); tack.setAttribute('stroke', '#3a1010'); tack.setAttribute('stroke-width', '1.4');
        svg.appendChild(tack);
      });

      if(link.label){
        var dx = num(link.labelDx, 0), dy = num(link.labelDy, 0);
        var lx = mx + dx, ly = my + dy;

        if(dx || dy){
          var leader = document.createElementNS(ns, 'line');
          leader.setAttribute('x1', mx); leader.setAttribute('y1', my);
          leader.setAttribute('x2', lx); leader.setAttribute('y2', ly);
          leader.setAttribute('stroke', '#8a1c1c'); leader.setAttribute('stroke-width', '1.5');
          leader.setAttribute('stroke-dasharray', '2 3'); leader.setAttribute('opacity', '0.6');
          svg.appendChild(leader);
        }

        var g = document.createElementNS(ns, 'g');
        g.setAttribute('class', 'string-label-group');

        var text = document.createElementNS(ns, 'text');
        text.setAttribute('x', 0); text.setAttribute('y', 5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'string-label-text');
        text.textContent = link.label;
        g.appendChild(text);
        svg.appendChild(g); // must be in the DOM before measuring

        var textWidth = text.getComputedTextLength();
        var padX = 12, boxH = 26;
        var boxW = textWidth + padX * 2;
        var bg = document.createElementNS(ns, 'rect');
        bg.setAttribute('x', -boxW / 2); bg.setAttribute('y', -boxH / 2);
        bg.setAttribute('width', boxW); bg.setAttribute('height', boxH);
        bg.setAttribute('rx', 2);
        bg.setAttribute('class', 'string-label-bg');
        g.insertBefore(bg, text);

        g.setAttribute('transform', 'translate(' + lx + ',' + ly + ')');
        startLabelDrag(link, g, mx, my);
      }
    });
  }

  function renderSections(){
    sectionsLayer.innerHTML = '';
    if(!state) return;
    state.sections.forEach(function(sec){
      var color = safeColor(sec.color);
      var div = document.createElement('div');
      div.className = 'zone';
      div.style.left = num(sec.x, 0) + 'px'; div.style.top = num(sec.y, 0) + 'px';
      div.style.width = num(sec.w, 100) + 'px'; div.style.height = num(sec.h, 100) + 'px';
      div.style.setProperty('--zc', color);
      div.style.background = hexToRgba(color, 0.12);
      div.innerHTML = '<div class="zone-tab" style="--zc:' + color + '">' +
        escapeHtml(sec.label) + '<span class="zone-del" title="Remove this section">✕</span></div>';
      sectionsLayer.appendChild(div);
      var tab = div.querySelector('.zone-tab');
      tab.querySelector('.zone-del').addEventListener('pointerdown', function(e){ e.stopPropagation(); });
      tab.querySelector('.zone-del').addEventListener('click', function(e){
        e.stopPropagation();
        if(window.confirm('Remove the section "' + sec.label + '"? The notices inside stay on the board.')){
          state.sections = state.sections.filter(function(s){ return s.id !== sec.id; });
          markDirty(); renderSections();
        }
      });
      tab.addEventListener('pointerdown', function(e){
        if(e.target.closest('.zone-del')) return;
        startZoneDrag(sec, div, tab, e);
      });
    });
  }

  function startZoneDrag(sec, div, tab, e){
    e.preventDefault(); e.stopPropagation();
    try{ tab.setPointerCapture(e.pointerId); }catch(err){}
    var startX = e.clientX, startY = e.clientY, origX = num(sec.x, 0), origY = num(sec.y, 0);
    var moved = false;
    function onMove(ev){
      var dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
      if(Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      sec.x = Math.max(0, origX + dx);
      sec.y = Math.max(0, origY + dy);
      div.style.left = sec.x + 'px';
      div.style.top = sec.y + 'px';
    }
    function onUp(){
      tab.removeEventListener('pointermove', onMove);
      tab.removeEventListener('pointerup', onUp);
      tab.removeEventListener('pointercancel', onUp);
      if(moved) markDirty();
    }
    tab.addEventListener('pointermove', onMove);
    tab.addEventListener('pointerup', onUp);
    tab.addEventListener('pointercancel', onUp);
  }

  function miniCardHtml(el, short){
    var meta = TYPE_META[el.type] || TYPE_META.evidence;
    if(el.type === 'comment'){
      return '<div class="mc-type">Note</div>' +
        '<div class="mc-note">' + escapeHtml((el.text||'').slice(0, short ? 40 : 80)) + '</div>';
    }
    return '<div class="mc-type">' + meta.label + '</div>' +
      '<div class="mc-name">' + escapeHtml(el.name||'') + '</div>' +
      (!short && el.note ? '<div class="mc-note">' + escapeHtml(el.note) + '</div>' : '');
  }

  function renderOffboardList(){
    offboardList.innerHTML = '';
    if(!state || state.offboard.length === 0){
      offboardList.innerHTML = '<div class="qb-empty">The satchel is empty.</div>';
      return;
    }
    state.offboard.forEach(function(el){
      var meta = TYPE_META[el.type] || TYPE_META.evidence;
      var mc = document.createElement('div');
      mc.className = 'mini-card' + (el.type === 'comment' ? ' mini-note' : '');
      mc.dataset.id = el.id;
      mc.style.setProperty('--tc', meta.hex);
      mc.innerHTML = '<div class="card-del" title="Throw away">✕</div>' + miniCardHtml(el, false);
      offboardList.appendChild(mc);
      mc.querySelector('.card-del').addEventListener('pointerdown', function(e){ e.stopPropagation(); });
      mc.querySelector('.card-del').addEventListener('click', function(e){
        e.stopPropagation();
        state.offboard = state.offboard.filter(function(x){ return x.id !== el.id; });
        markDirty(); renderOffboardList();
      });
      mc.addEventListener('pointerdown', function(e){
        if(e.target.closest('.card-del')) return;
        startOffboardDrag(el, mc, e);
      });
    });
  }

  function renderPhotoList(){
    var list = $('photoList');
    list.innerHTML = '';
    if(!state || !state.photos || !state.photos.length){
      list.innerHTML = '<div class="qb-empty">No pictures uploaded yet.</div>';
      return;
    }
    state.photos.forEach(function(ph){
      var thumb = document.createElement('div');
      thumb.className = 'photo-thumb';
      thumb.dataset.id = ph.id;
      thumb.innerHTML =
        '<div class="card-del" title="Take out of the satchel">✕</div>' +
        '<img src="' + escapeHtml(safeImageSrc(ph.src)) + '" alt="' + escapeHtml(ph.caption||'Picture') + '"/>' +
        (ph.caption ? '<div class="pt-caption">' + escapeHtml(ph.caption) + '</div>' : '');
      list.appendChild(thumb);
      thumb.querySelector('.card-del').addEventListener('pointerdown', function(e){ e.stopPropagation(); });
      thumb.querySelector('.card-del').addEventListener('click', function(e){
        e.stopPropagation();
        if(window.confirm('Take this picture out of the satchel?')){
          state.photos = state.photos.filter(function(p){ return p.id !== ph.id; });
          markDirty(); renderPhotoList();
        }
      });
      thumb.addEventListener('pointerdown', function(e){
        if(e.target.closest('.card-del')) return;
        startPhotoDrag(ph, thumb, e);
      });
    });
  }

  function compressImage(file, maxPx, cb){
    var reader = new FileReader();
    reader.onload = function(ev){
      var img = new Image();
      img.onload = function(){
        var w = img.width, h = img.height;
        if(w > maxPx || h > maxPx){
          if(w > h){ h = Math.round(h * maxPx / w); w = maxPx; }
          else{ w = Math.round(w * maxPx / h); h = maxPx; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function(){ alert('That file could not be read as a picture.'); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function overBoard(ev){
    var r = boardWrap.getBoundingClientRect();
    if(!(ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom)) return false;
    // Not when dropped back on the satchel, where it lies over the board (narrow screens).
    var under = document.elementFromPoint(ev.clientX, ev.clientY);
    return !(under && under.closest && under.closest('#offboard'));
  }

  function startOffboardDrag(el, sourceEl, e){
    e.preventDefault();
    var meta = TYPE_META[el.type] || TYPE_META.evidence;
    var ghost = document.createElement('div');
    ghost.className = 'mini-card drag-ghost' + (el.type === 'comment' ? ' mini-note' : '');
    ghost.style.setProperty('--tc', meta.hex);
    ghost.innerHTML = miniCardHtml(el, true);
    document.body.appendChild(ghost);
    function place(clientX, clientY){ ghost.style.left = (clientX + 12) + 'px'; ghost.style.top = (clientY + 12) + 'px'; }
    place(e.clientX, e.clientY);
    function onMove(ev){ place(ev.clientX, ev.clientY); }
    function cleanup(){
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', cleanup);
      if(ghost.parentNode) ghost.parentNode.removeChild(ghost);
    }
    function onUp(ev){
      cleanup();
      if(overBoard(ev)){
        var p = boardPointFromEvent(ev);
        el.x = Math.max(0, p.x - CARD_W/2);
        el.y = Math.max(0, p.y - CARD_H/2);
        state.offboard = state.offboard.filter(function(x){ return x.id !== el.id; });
        state.elements.push(el);
        markDirty(); renderOffboardList(); renderCards(); renderStrings();
      }
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', cleanup);   // an interrupted touch
  }

  function startPhotoDrag(ph, sourceEl, e){
    e.preventDefault();
    var ghost = document.createElement('div');
    ghost.className = 'drag-ghost-photo';
    ghost.innerHTML = '<img src="' + escapeHtml(safeImageSrc(ph.src)) + '" alt="">' +
      (ph.caption ? '<div>' + escapeHtml(ph.caption) + '</div>' : '');
    document.body.appendChild(ghost);
    function place(x,y){ ghost.style.left = (x+10)+'px'; ghost.style.top = (y+10)+'px'; }
    place(e.clientX, e.clientY);
    function onMove(ev){ place(ev.clientX, ev.clientY); }
    function cleanup(){
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', cleanup);
      if(ghost.parentNode) ghost.parentNode.removeChild(ghost);
    }
    function onUp(ev){
      cleanup();
      if(overBoard(ev)){
        var p = boardPointFromEvent(ev);
        var bel = { id: uid(), type: 'photo', src: ph.src, caption: ph.caption||'', x: Math.max(0, p.x - 100), y: Math.max(0, p.y - 60), w: 200 };
        state.elements.push(bel);
        markDirty(); renderCards(); renderStrings();
      }
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', cleanup);   // an interrupted touch
  }

  /* ------------------------------------------------ Person / Place / Handout
     The choices are the campaign's own NPCs, Maps and Handouts, minus
     anything the Dungeon Master has hidden from the party. If the hidden
     list cannot be checked, nothing is offered, so nothing unrevealed
     slips through. */
  var SITE = '../';   // this page sits one folder below the campaign
  function siteUrl(path){ return path ? SITE + encodeURI(String(path)) : ''; }
  function isPicture(path){ return /\.(png|jpe?g|gif|webp)$/i.test(path || ''); }
  // Handouts open in a new tab: only files from the campaign's own folders.
  function safeDocHref(h){
    h = String(h || '');
    return /^\.\.\/assets\/[\w\-.\/%]+\.(html?|pdf|png|jpe?g|gif|webp)$/i.test(h) && h.indexOf('..', 3) < 0 ? h : '';
  }

  async function hiddenList(kind){
    if(!db) throw new Error('not connected');
    var r = await withTimeout(db.from('archive_hidden').select('item').eq('chronicle', CHRONICLE).eq('kind', kind), 8000);
    if(r.error) throw r.error;
    var h = {};
    (r.data || []).forEach(function(row){ h[row.item] = true; });
    return h;
  }

  function arr(x){ return Array.isArray(x) ? x : []; }
  function pickerItems(type, hidden){
    if(type === 'person'){
      return arr(window.CAMPAIGN_NPCS).filter(function(n){ return n && n.name && !hidden[n.name]; }).map(function(n){
        return { name: String(n.name), sub: String(n.role || n.tagline || ''), src: isPicture(n.portrait) ? siteUrl(n.portrait) : '' };
      });
    }
    if(type === 'place'){
      return arr(window.CAMPAIGN_MAPS).filter(function(m){ return m && m.title && m.image && !hidden[m.image]; }).map(function(m){
        return { name: String(m.title), sub: String(m.when || m.description || ''), src: isPicture(m.image) ? siteUrl(m.image) : '' };
      });
    }
    return arr(window.CAMPAIGN_DOCUMENTS).filter(function(d){ return d && d.title && d.file && !hidden[d.file]; }).map(function(d){
      return { name: String(d.title), sub: String(d.description || d.when || ''), src: isPicture(d.file) ? siteUrl(d.file) : '', href: siteUrl(d.file) };
    });
  }

  var PICK_TITLE = { person: 'Choose a Person', place: 'Choose a Place', document: 'Choose a Handout' };
  var PICK_EMPTY = {
    person: 'Nothing here yet: the Dungeon Master has not added anyone the party has met.',
    place: 'Nothing here yet: no maps have been shared with the party so far.',
    document: 'Nothing here yet: no handouts have been shared with the party so far.'
  };
  async function openPicker(type){
    var title = PICK_TITLE[type];
    showModal('<h3>' + title + '</h3><p class="hint">Checking what the party may see…</p>');
    var hidden;
    try{ hidden = await hiddenList(PICKERS[type]); }
    catch(e){
      console.error(e);
      showModal('<h3>' + title + '</h3><p class="hint">Could not check what the Dungeon Master has revealed to the party, so nothing is offered just now. Try again in a moment.</p>' +
        closeButton());
      wireClose();
      return;
    }
    var items = pickerItems(type, hidden);
    var grid = items.length ? items.map(function(it, i){
      var src = safeImageSrc(it.src);
      return '<button type="button" class="pick-item" data-i="' + i + '">' +
        (src ? '<img src="' + escapeHtml(src) + '" alt="" loading="lazy">'
             : '<span class="pick-noimg">' + ICONS[type] + '</span>') +
        '<span class="pick-name">' + escapeHtml(it.name) + '</span>' +
        (it.sub ? '<span class="pick-sub">' + escapeHtml(it.sub) + '</span>' : '') + '</button>';
    }).join('') : '<p class="hint">' + PICK_EMPTY[type] + '</p>';
    showModal('<h3>' + title + '</h3>' +
      (items.length > 8 ? '<input id="pickSearch" placeholder="Search…" aria-label="Search" autocomplete="off">' : '') +
      '<div class="pick-grid' + (type !== 'person' ? ' pick-wide' : '') + '">' + grid + '</div>' +
      closeButton());
    document.querySelector('.modal').classList.add('modal-wide');
    wireClose();
    var search = $('pickSearch');
    if(search){
      search.focus();
      search.addEventListener('input', function(){
        var q = search.value.trim().toLowerCase();
        document.querySelectorAll('.pick-item').forEach(function(b){
          b.style.display = b.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
        });
      });
    }
    document.querySelectorAll('.pick-item').forEach(function(b){
      b.addEventListener('click', function(){
        closeModal();
        placePicked(type, items[+b.dataset.i]);
      });
    });
  }

  // Put the choice in the middle of what is on screen.
  function placePicked(type, it){
    if(!state){ alert('Start or open a board first.'); return; }
    var cx = (boardWrap.scrollLeft + boardWrap.clientWidth / 2) / zoom;
    var cy = (boardWrap.scrollTop + boardWrap.clientHeight / 2) / zoom;
    var el;
    var src = safeImageSrc(it.src);
    if(src){
      var w = type === 'place' ? 280 : 200;   // maps read better wide
      el = { id: uid(), type: type, src: src, caption: it.name.slice(0, 80), x: Math.max(0, cx - w/2), y: Math.max(0, cy - 120), w: w };
    } else if(type === 'document'){
      el = { id: uid(), type: 'document', name: it.name.slice(0, 60), href: safeDocHref(it.href), x: Math.max(0, cx - CARD_W/2), y: Math.max(0, cy - CARD_H/2) };
    } else {
      // Someone or somewhere with no picture yet: a notice with the name.
      el = { id: uid(), type: type, name: it.name.slice(0, 60), note: (it.sub || '').slice(0, 480), x: Math.max(0, cx - CARD_W/2), y: Math.max(0, cy - CARD_H/2) };
    }
    state.elements.push(el);
    markDirty(); renderCards(); renderStrings();
    toast(it.name + ' nailed to the board');
    // On a narrow screen the satchel lies over the board: get it out of the way.
    if(window.matchMedia('(max-width:820px)').matches) setLocker(false);
  }

  function renderTypeTabs(){
    var wrap = $('typeTabs');
    wrap.innerHTML = '';
    TYPE_ORDER.forEach(function(t){
      var meta = TYPE_META[t];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'type-tab' + (t === selectedType ? ' active' : '');
      btn.setAttribute('aria-pressed', t === selectedType ? 'true' : 'false');
      btn.style.setProperty('--type-color', meta.hex);
      btn.textContent = meta.label;
      btn.addEventListener('click', function(){ selectedType = t; renderTypeTabs(); });
      wrap.appendChild(btn);
    });
    switchForm(selectedType);
  }

  function switchForm(t){
    var picker = !!PICKERS[t];
    $('formStandard').style.display = (t === 'evidence') ? '' : 'none';
    $('formComment').style.display  = t === 'comment' ? '' : 'none';
    $('formPicker').style.display   = picker ? '' : 'none';
    var addBtn = $('btnAddOffboard');
    if(picker){
      $('pickerHint').textContent = {
        person: 'Choose someone the party has met. Their portrait goes straight onto the board.',
        place: 'Choose a map of a town, a dungeon or the road between. It goes straight onto the board.',
        document: 'Choose a letter, notice or scrap the party has found. It goes straight onto the board.'
      }[t];
      addBtn.textContent = { person: 'Choose a Person…', place: 'Choose a Place…', document: 'Choose a Handout…' }[t];
    } else {
      addBtn.textContent = t === 'comment' ? 'Put the Note in the Satchel' : 'Put the Lead in the Satchel';
    }
  }

  function renderLegend(){
    $('legend').innerHTML = TYPE_ORDER.map(function(t){
      var meta = TYPE_META[t];
      return '<span><i style="background:' + meta.hex + '"></i>' + meta.label + '</span>';
    }).join('');
  }

  function renderAll(){
    renderTopbar();
    renderSections();
    renderCards();
    renderStrings();
    renderOffboardList();
    renderPhotoList();
    updateControlsEnabled();
  }

  /* ================= zone drawing ================= */
  function toggleZoneMode(force){
    zoneMode = (typeof force === 'boolean') ? force : !zoneMode;
    boardEl.classList.toggle('zoning', zoneMode);
    $('btnZone').classList.toggle('zone-active', zoneMode);
    $('btnZone').setAttribute('aria-pressed', zoneMode ? 'true' : 'false');
  }

  boardEl.addEventListener('pointerdown', function(e){
    if(e.target.closest('.card') || e.target.closest('.card-pin') || e.target.closest('.zone-tab') || e.target.closest('.string-label-group')) return;

    if(zoneMode && state){
      e.preventDefault();
      var start = boardPointFromEvent(e);
      zonePreview.style.display = 'block';
      zonePreview.style.left = start.x + 'px';
      zonePreview.style.top = start.y + 'px';
      zonePreview.style.width = '0px';
      zonePreview.style.height = '0px';
      var onMoveZ = function(ev){
        var p = boardPointFromEvent(ev);
        zonePreview.style.left = Math.min(start.x, p.x) + 'px'; zonePreview.style.top = Math.min(start.y, p.y) + 'px';
        zonePreview.style.width = Math.abs(p.x - start.x) + 'px'; zonePreview.style.height = Math.abs(p.y - start.y) + 'px';
      };
      var stopZ = function(){
        document.removeEventListener('pointermove', onMoveZ);
        document.removeEventListener('pointerup', onUpZ);
        document.removeEventListener('pointercancel', stopZ);
        zonePreview.style.display = 'none';
        toggleZoneMode(false);
      };
      var onUpZ = function(ev){
        stopZ();
        var p = boardPointFromEvent(ev);
        var x = Math.min(start.x, p.x), y = Math.min(start.y, p.y);
        var w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
        if(w < 30 || h < 30) return;
        var label = window.prompt('Name this section of the board:', 'New Section');
        if(!label || !label.trim()) return;
        var color = ZONE_PALETTE[state.sections.length % ZONE_PALETTE.length];
        state.sections.push({ id: uid(), label: label.trim().slice(0,40), x: x, y: y, w: w, h: h, color: color });
        markDirty(); renderSections();
      };
      document.addEventListener('pointermove', onMoveZ);
      document.addEventListener('pointerup', onUpZ);
      document.addEventListener('pointercancel', stopZ);
      return;
    }

    // Pan: drag empty board space to scroll.
    e.preventDefault();
    boardEl.classList.add('panning');
    /* Move by how far the pointer travelled since the last event. Measured
       from where the drag began instead, a board stopped at its edge would
       not move again until the pointer came all the way back. */
    var lastX = e.clientX, lastY = e.clientY;
    function onMoveP(ev){
      boardWrap.scrollLeft -= ev.clientX - lastX;
      boardWrap.scrollTop  -= ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY;
    }
    function onUpP(){
      document.removeEventListener('pointermove', onMoveP);
      document.removeEventListener('pointerup', onUpP);
      document.removeEventListener('pointercancel', onUpP);
      boardEl.classList.remove('panning');
    }
    document.addEventListener('pointermove', onMoveP);
    document.addEventListener('pointerup', onUpP);
    document.addEventListener('pointercancel', onUpP);
  });

  /* ================= wire up static controls ================= */
  $('btnNew').addEventListener('click', newBoard);
  $('btnSave').addEventListener('click', saveBoard);
  $('btnLoad').addEventListener('click', openLoadModal);
  $('btnAccount').addEventListener('click', toggleAccount);
  $('btnZone').addEventListener('click', function(){
    if(!state){ alert('Start or open a board first.'); return; }
    toggleZoneMode();
  });
  /* The Satchel opens beside the board on wide screens and over it on
     narrow ones, where it starts closed. The choice is remembered in
     this browser. */
  var lockerTab = $('lockerTab');
  // Only the reader's own choice on a wide screen is remembered.
  function setLocker(open, remember){
    document.body.classList.toggle('locker-closed', !open);
    lockerTab.setAttribute('aria-expanded', open ? 'true' : 'false');
    lockerTab.title = open ? 'Hide the satchel' : 'Show the satchel';
    lockerTab.innerHTML = open ? '›' : '‹<span class="tab-label">Satchel</span>';
    if(remember && !window.matchMedia('(max-width:820px)').matches){
      try{ localStorage.setItem('questboard-satchel', open ? 'open' : 'closed'); }catch(e){}
    }
  }
  (function(){
    var saved = null;
    try{ saved = localStorage.getItem('questboard-satchel'); }catch(e){}
    var narrow = window.matchMedia('(max-width:820px)').matches;
    setLocker(narrow ? false : saved !== 'closed');
  })();
  lockerTab.addEventListener('click', function(){
    setLocker(document.body.classList.contains('locker-closed'), true);
  });
  $('zoomIn').addEventListener('click', zoomIn);
  $('zoomOut').addEventListener('click', zoomOut);
  $('zoomReset').addEventListener('click', zoomReset);
  /* The wheel zooms, centred on the pointer; dragging empty board pans.
     deltaMode 1 counts lines (Firefox), 2 pages.
     Wheel events pile up faster than the screen redraws, so they are
     summed and applied once per frame. While zooming, the board is
     scaled as a finished picture (will-change); it is redrawn sharp
     once the wheel stops. */
  var wheelDy = 0, wheelX = 0, wheelY = 0, wheelQueued = false, wheelSettle = null;
  boardWrap.addEventListener('wheel', function(e){
    e.preventDefault();
    var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    wheelDy += Math.max(-300, Math.min(300, dy));   // one fast flick cannot jump to the limit
    wheelX = e.clientX; wheelY = e.clientY;
    if(wheelQueued) return;
    wheelQueued = true;
    requestAnimationFrame(function(){
      wheelQueued = false;
      var d = wheelDy;
      wheelDy = 0;
      boardEl.style.willChange = 'transform';
      zoomTo(zoom * Math.exp(-d * 0.0015), wheelX, wheelY);
      clearTimeout(wheelSettle);
      wheelSettle = setTimeout(function(){ boardEl.style.willChange = ''; }, 250);
    });
  }, {passive: false});
  applyZoom();
  $('btnAddOffboard').addEventListener('click', function(){
    if(!state){ alert('Start or open a board first.'); return; }
    if(selectedType === 'comment'){
      var txt = $('inpCommentText').value.trim();
      if(!txt){ alert('Write something in the note first.'); return; }
      state.offboard.push({ id: uid(), type: 'comment', text: txt.slice(0,600) });
      $('inpCommentText').value = '';
      markDirty(); renderOffboardList();
    } else if(PICKERS[selectedType]){
      openPicker(selectedType);
    } else {
      var name = $('inpName').value.trim();
      if(!name){ alert('Give this lead a name first.'); return; }
      var note = $('inpNote').value.trim();
      state.offboard.push({ id: uid(), type: selectedType, name: name.slice(0,60), note: note.slice(0,480) });
      $('inpName').value = '';
      $('inpNote').value = '';
      markDirty(); renderOffboardList();
    }
  });

  $('photoUploadInput').addEventListener('change', function(e){
    var file = e.target.files && e.target.files[0];
    if(!file || !state) return;
    e.target.value = '';
    compressImage(file, 900, function(src){
      state.photos = state.photos || [];
      state.photos.push({ id: uid(), type: 'photo', src: src });
      markDirty(); renderPhotoList();
      toast('Picture added — drag it onto the board');
    });
  });

  $('photoUpload').addEventListener('click', function(){
    if(!state){ alert('Start or open a board first.'); return; }
    $('photoUploadInput').click();
  });

  $('photoClearAll').addEventListener('click', function(){
    if(!state || !state.photos || !state.photos.length) return;
    if(window.confirm('Take every picture out of the satchel? Pictures already on the board stay.')){
      state.photos = [];
      markDirty(); renderPhotoList();
    }
  });

  /* Until it is saved, the only copy of the work is this tab. */
  window.addEventListener('beforeunload', function(e){
    if(dirty){ e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      if(zoneMode) toggleZoneMode(false);
      else if($('modalRoot').innerHTML) closeModal();
    }
  });

  renderTypeTabs();
  renderLegend();
  renderTopbar();

  /* ================= boot =================
     Waits for the members' gate, then opens the latest saved version of
     the Quest Board, or a blank one if it has never been saved. The
     gate's Supabase client is reused, so the page holds one session. */
  (async function boot(){
    if(!VALID_CAMPAIGN || !window.Gate || !window.Gate.ready){
      console.error('Quest Board: no campaign (body data-campaign) or no gate.js on this page.');
      state = blankCase(DEFAULT_BOARD, DEFAULT_NAME); renderAll(); return;
    }
    var gate = await window.Gate.ready;   // never settles for someone turned away
    db = gate.db || null;
    if(!db){ state = blankCase(DEFAULT_BOARD, DEFAULT_NAME); renderAll(); return; }
    session = gate.session || await currentSession();
    db.auth.onAuthStateChange(function(_event, s){ session = s; checkEditor().then(renderTopbar); });
    await checkEditor();
    showLoading(true, 'Taking the board down from the wall…');
    try{
      if(!(await loadCase(DEFAULT_BOARD))){ state = blankCase(DEFAULT_BOARD, DEFAULT_NAME); renderAll(); }
    }catch(e){
      console.error(e);
      state = blankCase(DEFAULT_BOARD, DEFAULT_NAME);
      renderAll();
      toast('Could not reach the saved boards. Try Open… in a moment.');
    }finally{
      showLoading(false);
    }
  })();

})();
