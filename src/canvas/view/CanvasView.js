import { on, off } from 'utils/mixins';
const FrameView = require('./FrameView');
const $ = Backbone.$;

module.exports = Backbone.View.extend({
  initialize(o) {
    _.bindAll(
      this,
      'cloneIframeDocument',
      'renderIframeDocument',
      'onFrameScroll',
      'clearOff'
    );
    on(window, 'scroll resize', this.clearOff);
    this.config = o.config || {};
    this.em = this.config.em || {};
    this.ppfx = this.config.pStylePrefix || '';
    this.className = this.config.stylePrefix + 'canvas';
    this.listenTo(this.em, 'change:canvasOffset', this.clearOff);
    this.frame = new FrameView({
      model: this.model.get('frame'),
      config: this.config
    });
  },

  /**
   * Checks if the element is visible in the canvas's viewport
   * @param  {HTMLElement}  el
   * @return {Boolean}
   */
  isElInViewport(el) {
    const rect = el.getBoundingClientRect();
    const frameRect = this.getFrameOffset(1);
    const rTop = rect.top;
    const rLeft = rect.left;
    return (
      rTop >= 0 &&
      rLeft >= 0 &&
      rTop <= frameRect.height &&
      rLeft <= frameRect.width
    );
  },

  /**
   * Update tools position
   * @private
   */
  onFrameScroll() {
    var u = 'px';
    var body = this.frame.el.contentDocument.body;
    this.toolsEl.style.top = '-' + body.scrollTop + u;
    this.toolsEl.style.left = '-' + body.scrollLeft + u;
    this.em.trigger('canvasScroll');
  },

  /**
   * Insert scripts into head, it will call renderIframeDocument after all scripts loaded or failed
   * @private
   */
  renderScripts(onload = true) {
    const frame = this.frame;

    const inject = () => {
      var scripts = this.config.scripts.slice(0), // clone
        counter = 0;

      const appendScript = scripts => {
        if (scripts.length > 0) {
          var script = document.createElement('script');
          script.type = 'text/javascript';
          script.src = scripts.shift();
          script.onerror = script.onload = appendScript.bind(null, scripts);
          frame.el.contentDocument.head.appendChild(script);
        } else {
          this.renderIframeDocument();
        }
      };
      appendScript(scripts);
    };

    if (onload) {
      frame.el.onload = inject;
    } else {
      inject();
    }
  },

  /**
   * If `fromDocument` is true, clone the entire document's structure
   * except for the body with the already parsed DOM components.
   * This ensures that doctypes, favicons, classes, etc. in higher level components
   * like the html tag are respected.
   * @private
   */
  cloneIframeDocument(canvasDocumentTemplate) {
    const fdoc = this.frame.el.contentDocument;

    fdoc.open('text/html', 'replace');
    if (this.frame.el.attributes.srcDoc) {
      fdoc.write(this.frame.el.attributes.srcDoc.value);
    }
    fdoc.write(canvasDocumentTemplate);
    fdoc.close();

    let called = false;
    const nextOnce = () => {
      if (called) return;
      called = true;

      $(fdoc).off('readystatechange', nextOnce);

      if (this.config.scripts.length === 0) {
        this.renderIframeDocument();
      } else {
        this.renderScripts(false); // will call renderIframeDocument later
      }
    };

    // Setting frame.onload does not function after writing to the document
    // Readystatechange is called as expected
    if (fdoc.readyState === 'complete' || fdoc.readyState === 'interactive') {
      nextOnce();
    } else {
      $(fdoc).on('readystatechange', nextOnce);
    }
  },

  /**
   * Render inside frame's body
   * @private
   */
  renderIframeDocument() {
    const wrap = this.model.get('frame').get('wrapper');
    if (wrap) {
      const mdoc = window.document;
      const em = this.config.em;
      const ppfx = this.ppfx;
      const cssc = em.get('CssComposer');
      const conf = em.get('Config');
      const confCanvas = this.config;
      const protCss = conf.protectedCss;
      const fdoc = this.frame.el.contentDocument;
      let $body = $(fdoc.body);

      // If fromDocument is true, the wrapper equals the body
      if (em.config.fromDocument) {
        $body.remove();
        $(fdoc.documentElement).append(wrap.render());
        $body = $(fdoc.body);
      } else {
        $body.append(wrap.render());
      }

      let externalStyles = '';
      confCanvas.styles.forEach(style => {
        externalStyles += `<link rel="stylesheet" href="${style}"/>`;
      });

      const colorWarn = '#ffca6f';

      const cm = em.get('DomComponents');
      const cmc = cm.getConfig();
      const wrapperSelector = cmc.wrapperClass
        ? '.' + cmc.wrapperClass
        : '#' + cmc.wrapperId;

      const baseCss = em.config.baseCss
        ? em.config.baseCss.replace(/%WRAPPER_SELECTOR%/gi, wrapperSelector)
        : '';

      // I need all this styles to make the editor work properly
      // Remove `html { height: 100%;}` from the baseCss as it gives jumpings
      // effects (on ENTER) with RTE like CKEditor (maybe some bug there?!?)
      // With `body {height: auto;}` jumps in CKEditor are removed but in
      // Firefox is impossible to drag stuff in empty canvas, so bring back
      // `body {height: 100%;}`.
      // For the moment I give the priority to Firefox as it might be
      // CKEditor's issue
      var frameCss = `
        ${baseCss}

        .${ppfx}dashed *[data-highlightable] {
          outline: 1px dashed rgba(170,170,170,0.7);
          outline-offset: -2px;
        }

        .${ppfx}comp-selected {
          outline: 3px solid #3b97e3 !important;
          outline-offset: -3px;
        }

        .${ppfx}comp-selected-parent {
          outline: 2px solid ${colorWarn} !important
        }

        .${ppfx}no-select {
          user-select: none;
          -webkit-user-select:none;
          -moz-user-select: none;
        }

        .${ppfx}freezed {
          opacity: 0.5;
          pointer-events: none;
        }

        .${ppfx}no-pointer {
          pointer-events: none;
        }

        .${ppfx}plh-image {
          background: #f5f5f5;
          border: none;
          height: 50px;
          width: 50px;
          display: block;
          outline: 3px solid #ffca6f;
          cursor: pointer;
          outline-offset: -2px
        }

        .${ppfx}grabbing {
          cursor: grabbing;
          cursor: -webkit-grabbing;
        }

        ${conf.canvasCss || ''}
        ${protCss || ''}
      `;

      if (externalStyles) {
        $body.append(externalStyles);
      }
      $body.append('<style>' + frameCss + '</style>');
      $body.append(cssc.render());
      $body.append(this.getJsContainer());

      em.trigger('loaded');
      this.frame.el.contentWindow.onscroll = this.onFrameScroll;
      this.frame.udpateOffset();

      // When the iframe is focused the event dispatcher is not the same so
      // I need to delegate all events to the parent document
      // Unfortunately just creating `KeyboardEvent(e.type, e)` is not enough,
      // the keyCode/which will be always `0`. Even if it's an old/deprecated
      // property keymaster (and many others) still use it... using `defineProperty`
      // hack seems the only way
      const createCustomEvent = (e, cls) => {
        const oEvent = new window[cls](e.type, e);
        oEvent.keyCodeVal = e.keyCode;
        ['keyCode', 'which'].forEach(prop => {
          Object.defineProperty(oEvent, prop, {
            get() {
              return this.keyCodeVal;
            }
          });
        });
        return oEvent;
      };

      [
        { event: 'keydown keyup', class: 'KeyboardEvent' }
        //{ event: 'mousedown mousemove mouseup', class: 'MouseEvent' },
      ].forEach(obj =>
        obj.event.split(' ').forEach(event => {
          fdoc.addEventListener(event, e =>
            mdoc.dispatchEvent(createCustomEvent(e, obj.class))
          );
        })
      );
    }
  },

  /**
   * Get the offset of the element
   * @param  {HTMLElement} el
   * @return {Object}
   */
  offset(el) {
    var rect = el.getBoundingClientRect();
    var docBody = el.ownerDocument.body;
    return {
      top: rect.top + docBody.scrollTop,
      left: rect.left + docBody.scrollLeft,
      width: rect.width,
      height: rect.height
    };
  },

  /**
   * Cleare cached offsets
   * @private
   */
  clearOff() {
    this.frmOff = null;
    this.cvsOff = null;
  },

  /**
   * Return frame offset
   * @return {Object}
   * @private
   */
  getFrameOffset(force = 0) {
    if (!this.frmOff || force) this.frmOff = this.offset(this.frame.el);
    return this.frmOff;
  },

  /**
   * Return canvas offset
   * @return {Object}
   * @private
   */
  getCanvasOffset() {
    if (!this.cvsOff) this.cvsOff = this.offset(this.el);
    return this.cvsOff;
  },

  /**
   * Returns element's data info
   * @param {HTMLElement} el
   * @return {Object}
   * @private
   */
  getElementPos(el, opts) {
    var opt = opts || {};
    var frmOff = this.getFrameOffset();
    var cvsOff = this.getCanvasOffset();
    var eo = this.offset(el);

    var frmTop = opt.avoidFrameOffset ? 0 : frmOff.top;
    var frmLeft = opt.avoidFrameOffset ? 0 : frmOff.left;

    const top = eo.top + frmTop - cvsOff.top;
    const left = eo.left + frmLeft - cvsOff.left;
    // clientHeight/clientWidth are for SVGs
    const height = el.offsetHeight || el.clientHeight;
    const width = el.offsetWidth || el.clientWidth;

    return { top, left, height, width };
  },

  /**
   * Returns position data of the canvas element
   * @return {Object} obj Position object
   * @private
   */
  getPosition() {
    const doc = this.frame.el.contentDocument;
    if (!doc) return;
    const bEl = doc.body;
    const fo = this.getFrameOffset();
    const co = this.getCanvasOffset();
    return {
      top: fo.top + bEl.scrollTop - co.top,
      left: fo.left + bEl.scrollLeft - co.left
    };
  },

  /**
   * Update javascript of a specific component passed by its View
   * @param {View} view Component's View
   * @private
   */
  updateScript(view) {
    if (!view.scriptContainer) {
      view.scriptContainer = $('<div>');
      this.getJsContainer().append(view.scriptContainer.get(0));
    }

    const model = view.model;
    const id = model.getId();
    view.el.id = id;
    view.scriptContainer.html('');
    // In editor, I make use of setTimeout as during the append process of elements
    // those will not be available immediatly, therefore 'item' variable
    const script = document.createElement('script');
    script.innerHTML = `
        setTimeout(function() {
          var item = document.getElementById('${id}');
          if (!item) return;
          (function(){
            ${model.getScriptString()};
          }.bind(item))()
        }, 1);`;
    // #873
    // Adding setTimeout will make js components work on init of the editor
    setTimeout(() => view.scriptContainer.get(0).appendChild(script), 0);
  },

  /**
   * Get javascript container
   * @private
   */
  getJsContainer() {
    if (!this.jsContainer) {
      this.jsContainer = $(`<div class="${this.ppfx}js-cont">`).get(0);
    }
    return this.jsContainer;
  },

  render(canvasDocumentTemplate = null) {
    this.wrapper = this.model.get('wrapper');

    if (this.wrapper && typeof this.wrapper.render == 'function') {
      this.model.get('frame').set('wrapper', this.wrapper);

      this.$el.append(this.frame.render().el);
      var frame = this.frame;

      if (this.em.config.fromDocument) {
        frame.el.onload = this.cloneIframeDocument.bind(
          this,
          canvasDocumentTemplate
        );
      } else {
        if (this.config.scripts.length === 0) {
          frame.el.onload = this.renderIframeDocument;
        } else {
          this.renderScripts(); // will call renderIframeDocument later
        }
      }
    }
    var ppfx = this.ppfx;
    this.$el.append(`
      <div id="${ppfx}tools" style="pointer-events:none">
        <div class="${ppfx}highlighter"></div>
        <div class="${ppfx}badge"></div>
        <div class="${ppfx}placeholder">
          <div class="${ppfx}placeholder-int"></div>
        </div>
        <div class="${ppfx}ghost"></div>
        <div class="${ppfx}toolbar" style="pointer-events:all"></div>
        <div class="${ppfx}resizer"></div>
        <div class="${ppfx}offset-v"></div>
        <div class="${ppfx}offset-fixed-v"></div>
      </div>
    `);
    const el = this.el;
    const toolsEl = el.querySelector(`#${ppfx}tools`);
    this.hlEl = el.querySelector(`.${ppfx}highlighter`);
    this.badgeEl = el.querySelector(`.${ppfx}badge`);
    this.placerEl = el.querySelector(`.${ppfx}placeholder`);
    this.ghostEl = el.querySelector(`.${ppfx}ghost`);
    this.toolbarEl = el.querySelector(`.${ppfx}toolbar`);
    this.resizerEl = el.querySelector(`.${ppfx}resizer`);
    this.offsetEl = el.querySelector(`.${ppfx}offset-v`);
    this.fixedOffsetEl = el.querySelector(`.${ppfx}offset-fixed-v`);
    this.toolsEl = toolsEl;
    this.el.className = this.className;

    return this;
  }
});
