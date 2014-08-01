

    //-------------------------------------------------------------------------
    // base helper methods
    //-------------------------------------------------------------------------

    function get(id)        { return document.getElementById(id);  };
    function hide(id)       { get(id).style.visibility = 'hidden'; };
    function show(id)       { get(id).style.visibility = null;     };
    function html(id, html) { get(id).innerHTML = html;            };

    function timestamp()           { return new Date().getTime();                             };
    function random(min, max)      { return (min + (Math.random() * (max - min)));            };
    function randomChoice(choices) { return choices[Math.round(random(0, choices.length-1))]; };

    if (!window.requestAnimationFrame) { // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
      window.requestAnimationFrame = window.webkitRequestAnimationFrame || 
                                     window.mozRequestAnimationFrame    || 
                                     window.oRequestAnimationFrame      || 
                                     window.msRequestAnimationFrame     || 
                                     function(callback, element) {
                                       window.setTimeout(callback, 1000 / 60);
                                     }
    }

    //-------------------------------------------------------------------------
    // game constants
    //-------------------------------------------------------------------------

    var KEY     = { ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 },
        DIR     = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3, MIN: 0, MAX: 3 },
        stats   = new Stats(),
        canvas  = get('canvas'),
        ctx     = canvas.getContext('2d'),
        ucanvas = get('upcoming'),
        uctx    = ucanvas.getContext('2d'),
        speed   = { start: 0.4, decrement: 0, min: 0.4 }, // how long before piece drops by 1 row (seconds)
        nx      = 10, // width of tetris court (in blocks)
        ny      = 20, // height of tetris court (in blocks)
        nu      = 5, // width/height of upcoming preview (in blocks)
        level2  = false,
        level3  = false,
        level4  = false,
        level5  = false, // for changing levels and music (added by R. C. Howell)
        pltt    = ["#1abc9c","#2ecc71","#3498db","#9b59b6","#34495e","#16a085","#27ae60","#2980b9","#8e44ad","#2c3e50","#f1c40f","#e67e22","#e74c3c","#7f8c8d","#f39c12","#d35400","#c0392b"]; // Color array. src flatuicolors.com (added by R. C. Howell)

    //-------------------------------------------------------------------------
    // game variables (initialized during reset)
    //-------------------------------------------------------------------------

    var dx, dy,        // pixel size of a single tetris block
        blocks,        // 2 dimensional array (nx*ny) representing tetris court - either empty block or occupied by a 'piece'
        actions,       // queue of user actions (inputs)
        playing,       // true|false - game is in progress
        dt,            // time since starting this game
        current,       // the current piece
        next,          // the next piece
        score,         // the current score
        vscore,        // the currently displayed score (it catches up to score in small chunks - like a spinning slot machine)
        rows,          // number of completed rows in the current game
        step,         // how long before current piece drops by 1 row
        invert = false; // Added by R. C. Howell for when the game flips and keys are reassigned

    //-------------------------------------------------------------------------
    // tetris pieces
    //
    // blocks: each element represents a rotation of the piece (0, 90, 180, 270)
    //         each element is a 16 bit integer where the 16 bits represent
    //         a 4x4 set of blocks, e.g. j.blocks[0] = 0x44C0
    //
    //             0100 = 0x4 << 3 = 0x4000
    //             0100 = 0x4 << 2 = 0x0400
    //             1100 = 0xC << 1 = 0x00C0
    //             0000 = 0x0 << 0 = 0x0000
    //                               ------
    //                               0x44C0
    //
    //-------------------------------------------------------------------------

    var i = { id: 'i', size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: "#000"    }; // Objects
    var j = { id: 'j', size: 3, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: "#000"    };
    var l = { id: 'l', size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: "#000"    };
    var o = { id: 'o', size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: "#000"    };
    var s = { id: 's', size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: "#000"    };
    var t = { id: 't', size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: "#000"    };
    var z = { id: 'z', size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: "#000"    };

    //------------------------------------------------
    // do the bit manipulation and iterate through each
    // occupied block (x,y) for a given piece
    //------------------------------------------------
    function eachblock(type, x, y, dir, fn) {
      var bit, result, row = 0, col = 0, blocks = type.blocks[dir];
      for(bit = 0x8000 ; bit > 0 ; bit = bit >> 1) {
        if (blocks & bit) {
          fn(x + col, y + row);
        }
        if (++col === 4) {
          col = 0;
          ++row;
        }
      }
    };

    //-----------------------------------------------------
    // check if a piece can fit into a position in the grid
    //-----------------------------------------------------
    function occupied(type, x, y, dir) {
      var result = false
      eachblock(type, x, y, dir, function(x, y) {
        if ((x < 0) || (x >= nx) || (y < 0) || (y >= ny) || getBlock(x,y))
          result = true;
      });
      return result;
    };

    function unoccupied(type, x, y, dir) {
      return !occupied(type, x, y, dir);
    };

    //-----------------------------------------
    // start with 4 instances of each piece and
    // pick randomly until the 'bag is empty'
    //-----------------------------------------
    var pieces = [];
    function randomPiece() {
      if (pieces.length == 0)
        pieces = [i,i,i,i,j,j,j,j,l,l,l,l,o,o,o,o,s,s,s,s,t,t,t,t,z,z,z,z];
      var type = pieces.splice(random(0, pieces.length-1), 1)[0];
      return { type: type, dir: DIR.UP, x: Math.round(random(0, nx - type.size)), y: 0 };
    };


    //-------------------------------------------------------------------------
    // GAME LOOP
    //-------------------------------------------------------------------------

    function run() {

     // showStats(); // initialize FPS counter
      addEvents(); // attach keydown and resize events

      var last = now = timestamp();
      function frame() {
        now = timestamp();
        update(Math.min(1, (now - last) / 1000.0)); // using requestAnimationFrame have to be able to handle large delta's caused when it 'hibernates' in a background or non-visible tab
        draw();
        //stats.update();
        last = now;
        requestAnimationFrame(frame, canvas);
      }
      music();
      resize(); // setup all our sizing information
      reset();  // reset the per-game variables
      frame();  // start the first frame

    };

    // function showStats() {
    //   stats.domElement.id = 'stats';
    //   get('menu').appendChild(stats.domElement);
    // };

    function addEvents() {
      document.addEventListener('keydown', keydown, false);
      window.addEventListener('resize', resize, false);
    };

    function resize(event) {
      canvas.width   = canvas.clientWidth;  // set canvas logical size equal to its physical size
      canvas.height  = canvas.clientHeight; // (ditto)
      ucanvas.width  = ucanvas.clientWidth;
      ucanvas.height = ucanvas.clientHeight;
      dx = canvas.width  / nx; // pixel size of a single tetris block
      dy = canvas.height / ny; // (ditto)
      invalidate();
      invalidateNext();
    };

    function keydown(ev) {
      var handled = false;
      if (playing) {
        if(invert){ // this is to reassign the left and right keys
          switch(ev.keyCode) {
            case KEY.LEFT:   actions.push(DIR.RIGHT); handled = true; break;
            case KEY.RIGHT:  actions.push(DIR.LEFT);  handled = true; break;
            case KEY.UP:     actions.push(DIR.UP);    handled = true; break;
            case KEY.DOWN:   actions.push(bottomOut());  handled = true; break;
            case KEY.SPACE:    toggleGame();          handled = true; break;
          }
        }else{
          switch(ev.keyCode) {
            case KEY.LEFT:   actions.push(DIR.LEFT);  handled = true; break;
            case KEY.RIGHT:  actions.push(DIR.RIGHT); handled = true; break;
            case KEY.UP:     actions.push(DIR.UP);    handled = true; break;
            case KEY.DOWN:   actions.push(bottomOut());  handled = true; break;
            case KEY.SPACE:    toggleGame();          handled = true; break;
          }
        }
      }
      else if (ev.keyCode == KEY.SPACE) {
        toggleGame();
        handled = true;
      }
      if (handled)
        ev.preventDefault(); // prevent arrow keys from scrolling the page (supported in IE9+ and all other browsers)
    };

    //-------------------------------------------------------------------------
    // GAME LOGIC
    //-------------------------------------------------------------------------
    function play(){
      hide('start');
      //reset();
      playing = true;
      sound1.play();
      bg();
      html('rows', rows);
    };
    function pause(){
      show('start');
      setVisualScore();
      playing = false;
      sound1.pause();
      sound2.pause();
      sound3.pause();
      sound4.pause();
      sound5.pause();
      html('rows', 'paused');
    };
    function toggleGame(){
      if(playing){
        pause();
      }else{
        play();
      }
    }
    function setVisualScore(n)      { vscore = n || score; invalidateScore(); };
    function setScore(n)            { score = n; setVisualScore(n);  };
    function addScore(n)            { score = score + n;   };
    function clearScore()           { setScore(0); };
    function clearRows()            { setRows(0); };
    function setRows(n)             { rows = n; step = Math.max(speed.min, speed.start - (speed.decrement*rows)); invalidateRows(); };
    function addRows(n)             { setRows(rows + n); };
    function getBlock(x,y)          { return (blocks && blocks[x] ? blocks[x][y] : null); };
    function setBlock(x,y,type)     { blocks[x] = blocks[x] || []; blocks[x][y] = type; invalidate(); };
    function clearBlocks()          { blocks = []; invalidate(); }
    function clearActions()         { actions = []; };
    function setCurrentPiece(piece) { current = piece || randomPiece(); invalidate();     };
    function setNextPiece(piece)    { next    = piece || randomPiece(); invalidateNext(); };

    function reset() {
      dt = 0;
      clearActions();
      clearBlocks();
      clearRows();
      clearScore();
      setCurrentPiece(next);
      setNextPiece();
    };

    function update(idt) {
      if (playing) {
        if (vscore < score)
          setVisualScore(vscore + 1);
        handle(actions.shift());
        dt = dt + idt;
        if (dt > step) {
          dt = dt - step;
          drop();
        }
      }
    };

    function handle(action) {
      switch(action) {
        case DIR.LEFT:  move(DIR.LEFT);  break;
        case DIR.RIGHT: move(DIR.RIGHT); break;
        case DIR.UP:    rotate();        break;
        case DIR.DOWN:  drop();          break;
      }
    };

    function move(dir) {
      var x = current.x, y = current.y;
      switch(dir) {
        case DIR.RIGHT: x = x + 1; break;
        case DIR.LEFT:  x = x - 1; break;
        case DIR.DOWN:  y = y + 1; break;
      }
      if (unoccupied(current.type, x, y, current.dir)) {
        current.x = x;
        current.y = y;
        invalidate();
        return true;
      }
      else {
        return false;
      }
    };

    function rotate(dir) {
      var newdir = (current.dir == DIR.MAX ? DIR.MIN : current.dir + 1);
      if (unoccupied(current.type, current.x, current.y, newdir)) {
        current.dir = newdir;
        invalidate();
      }
      bg();
    };

    function drop() {
      if (!move(DIR.DOWN)) {
        addScore(10);
        dropPiece();
        removeLines();
        setCurrentPiece(next);
        setNextPiece(randomPiece());
        clearActions();
        if (occupied(current.type, current.x, current.y, current.dir)) {
          lose();
        }
      }
    };

    function dropPiece() {
      eachblock(current.type, current.x, current.y, current.dir, function(x, y) {
        setBlock(x, y, current.type);
      });
    };

    function removeLines() {
      var x, y, complete, n = 0;
      for(y = ny ; y > 0 ; --y) {
        complete = true;
        for(x = 0 ; x < nx ; ++x) {
          if (!getBlock(x, y))
            complete = false;
        }
        if (complete) {
          removeLine(y);
          y = y + 1; // recheck same line
          n++;
        }
      }
      if (n > 0) {
        addRows(n);
        addScore(100*Math.pow(2,n-1)); // 1: 100, 2: 200, 3: 400, 4: 800
      }
      bg();
    };

    function removeLine(n) {
      var x, y;
      for(y = n ; y >= 0 ; --y) {
        for(x = 0 ; x < nx ; ++x)
          setBlock(x, y, (y == 0) ? null : getBlock(x, y-1));
      }
      flip(n);
      bg();
    };

    //-------------------------------------------------------------------------
    // RENDERING
    //-------------------------------------------------------------------------

    var invalid = {};

    function invalidate()         { invalid.court  = true; }
    function invalidateNext()     { invalid.next   = true; }
    function invalidateScore()    { invalid.score  = true; }
    function invalidateRows()     { invalid.rows   = true; }

    function draw() {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#fff";
      ctx.translate(0.5, 0.5); // for crisp 1px lines
      drawCourt();
      drawNext();
      drawScore();
      drawRows();
      ctx.restore();
    };

    function drawCourt() {
      if (invalid.court) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (playing)
          drawPiece(ctx, current.type, current.x, current.y, current.dir);
        var x, y, block;
        for(y = 0 ; y < ny ; y++) {
          for (x = 0 ; x < nx ; x++) {
            if (block = getBlock(x,y))
              drawBlock(ctx, x, y, block.color);
          }
        }
        ctx.strokeStyle = 'transparent';
        ctx.strokeRect(0, 0, nx*dx - 1, ny*dy - 1); // court boundary
        invalid.court = false;
      }
    };

    function drawNext() {
      if (invalid.next) {
        var padding = (nu - next.type.size) / 2; // half-arsed attempt at centering next piece display
        uctx.save();
        uctx.strokeStyle = '#fff';
        uctx.translate(0.5, 0.5);
        uctx.clearRect(0, 0, nu*dx, nu*dy);
        drawPiece(uctx, next.type, padding, padding, next.dir);
        //uctx.strokeRect(0, 0, nu*dx - 1, nu*dy - 1);
        uctx.restore();
        invalid.next = false;
      }
    };

    function drawScore() {
      if (invalid.score) {
        html('score', ("00000" + Math.floor(vscore)).slice(-5));
        invalid.score = false;
      }
    };

    function drawRows() {
      if (invalid.rows) {
        html('rows', rows);
        invalid.rows = false;
        if(rows >= 10 && level2 == false){
          var color = document.getElementsByClassName('level-fill')[0].style.backgroundColor;
          get('left').style.backgroundColor = color;
          get('right').style.backgroundColor = color;
          sound1.fadeOut(0,500);
          sound2.play();
          level2 = true;
          flash();
        }else if(rows >= 20 && level3 == false){
          var color = document.getElementsByClassName('level-fill')[0].style.backgroundColor;
          get('left').style.backgroundColor = color;
          get('right').style.backgroundColor = color;
          sound2.fadeOut(0,500);
          sound3.play();
          level3 = true;
          flash();
        }else if(rows >= 30 && level4 == false){
          var color = document.getElementsByClassName('level-fill')[0].style.backgroundColor;
          get('left').style.backgroundColor = color;
          get('right').style.backgroundColor = color;
          sound3.fadeOut(0,500);
          sound4.play();
          level4 = true;
          flash();
        }else if(rows >= 40 && level5 == false){
          var color = document.getElementsByClassName('level-fill')[0].style.backgroundColor;
          get('left').style.backgroundColor = color;
          get('right').style.backgroundColor = color;
          sound4.fadeOut(0,500);
          sound5.play();
          level5 = true;
          flash();
        }else if(rows >= 50){
          pause();
        }
        progressFill();
      }
    };

    function drawPiece(ctx, type, x, y, dir) {
      eachblock(type, x, y, dir, function(x, y) {
        drawBlock(ctx, x, y, '#000');
      });
    };

    function drawBlock(ctx, x, y, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x*dx, y*dy, dx, dy);
      ctx.strokeRect(x*dx, y*dy, dx, dy)
    };

    // =================================================================================
    // Audio (added by R. C. Howell) using howler.js
    // http://goldfirestudios.com/blog/104/howler.js-Modern-Web-Audio-Javascript-Library
    // =================================================================================
    function music(){
      sound1 = new Howl({
        urls: ['music/gaia-tuvan.mp3']
      });
      sound2 = new Howl({
        urls: ['music/future.mp3']
      });
      sound3 = new Howl({
        urls: ['music/skrillex.mp3']
      });
      sound4 = new Howl({
        urls: ['music/grizmatik.mp3']
      });
      sound5 = new Howl({
        urls: ['music/numanuma.mp3']
      });
    }
    function mute(audio){
      if(audio){
        sound.mute();
        get("no-audio").setAttribute("onclick", "mute(false)");
      }else{
        sound.unmute();
        get("no-audio").setAttribute("onclick", "mute(true)");
      }
    }

    // =========================================
    // background color (added by R. C. Howell)
    // http://www.paulirish.com/2009/random-hex-color-code-snippets/
    // =========================================
    function color(){
      // var hex = '#'+Math.floor(Math.random()*16777215).toString(16); // The random hex generator is credited to Paul Irish. Thank you!
      return pltt[Math.floor(Math.random() * 16)];
    }
    function bg(){
      get("color-overlay").style.backgroundColor = color();
    }

    // ==============================
    // rotate (added by R. C. Howell)
    // ==============================
    function flip(n){
      if(get("canvas").style.transform == "rotate(180deg)"){
        get("canvas").style.transform = "rotate(0deg)";
        invert = false;
      }else{
        get("canvas").style.transform = "rotate(180deg)";
        invert = true;
      }
    }

    // ================================================
    // Pause and Lose functions (added by R. C. Howell)
    // ================================================
    function lose(){
      pause();
      setTimeout(function(){
        reset();
      },2000);
      html('rows','Game Over')
    }

    // ===================================================
    // Levels (added by R. C. Howell)
    // ===================================================
    function progressFill(){
      var fills = document.getElementsByClassName('level-fill');
      var bg = color();
      if(level2){
        for (var i = 0 ; i < fills.length ; i++ ) {
          fills[i].style.height =    (rows - 10) * 10 + "vh";
          fills[i].style.backgroundColor =    bg;
        }
      }else{
        for (var i = 0 ; i < fills.length ; i++ ) {
          fills[i].style.height =    rows * 10 + "vh";
          fills[i].style.backgroundColor =    bg;
        }
      }
    }

    // =========================================================================
    // drop the block all the way down to speed up play (added by R. C. Howell)
    // =========================================================================
    function bottomOut(){
      for( var p = 0; p <= ny; p++){
        move(DIR.DOWN);

      }
    }

    // ======================================================================
    // Scoreboard flash when you move to a new level (added by R. C. Howell)
    // ======================================================================
    function flash(){
      get('rows-container').style.borderTop = "8px solid #fff";
      get('rows-container').style.borderBottom = "8px solid #fff";
      setTimeout(function(){
        get('rows-container').style.borderTop = "none";
        get('rows-container').style.borderBottom = "none";
      }, 1000);
    }

    //-------------------------------------------------------------------------
    // FINALLY, lets run the game
    //-------------------------------------------------------------------------

    run();
