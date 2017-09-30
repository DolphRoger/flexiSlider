/**
 * flexiSlider - a flex layout based slider with no strings attached.
 * @version 0.1
 */
(function ($, undefined) {

  "use strict";

  $.fn.flexiSlider = function () {
    if (this.length === 0) { //no element in queue
      return this; //do nothing, keep chain
    } else if (this.length > 1) { //initialize on multiple elements
      this.each(function () { //walk through elements
        $(this).flexiSlider(arguments[0]); //initialize each element
      });
      return this; //keep chain
    }
    if (this.data('flexi')) { //slider is already initialized
      if (typeof (arguments[0]) === 'string') { //interface for calling methods and setting options
        var flexi = this.data('flexi'); //get interface object reference from element data
        if ($.isFunction(Interface[arguments[0]]) && $.isFunction(flexi[arguments[0]])) { //call a interface method on the flexislider object
          flexi[arguments[0]].apply(flexi, Array.prototype.slice.call(arguments, 1)); //apply call to interface method with all parameters
        } else { //get or set an option
          if (arguments.length > 1) { //two parameters (or more)
            if (RuntimeDefaults[arguments[0]] !== undefined) { //restrict to default settings set to not overwrite private variables
              flexi.set(arguments[0], arguments[1]); //set option (other parameters ignored) 
            } else {
              Debug.log('The option "' + arguments[0] + '" cannot be set.'); //trying to set an unknown or private variable
            }
          } else { //one parameter
            return flexi.get(arguments[0]); //get an option value
          }
        }
      }
      return this; //nothing to do, keep chain
    }
    var settings = $.extend({}, InitDefaults, RuntimeDefaults, arguments[0] || {}); //build settings by extending defaults with options passed
    var flexiSlider = $.extend({}, Vars, Interface, Hooks, Utils, settings.debug ? Debug : {}); //clone a new slider object
    this.data('flexi.settings', {}); //create empty settings object (will be filled during initialization) 
    this.data('flexi', flexiSlider); //save back reference to newly created slider
    return flexiSlider.initialize(this, settings); //initialize the slider with passed options 
  };

  //local variables
  let Vars = {
    container: null, //outer container
    $container: null, //outer container (jquery)
    containerWidth: null, //current outer container width
    $slides: null, //slides container
    $slide: null, //collection of slides
    $navigation: null, //slider navigation element (dynamically added)
    slideCount: 0, //how many elements of slide are found
    slidePos: 0, //current scrolling position (element index)
    slideScroll: 0, //how many elements to scroll with one event
    slideGroup: 0, //how many items to show at once
    slideMargin: 0, //amount of margin between the boxes, number only 
    slideMarginUnit: '', //unit of the margin between the boxes, defaults to px if margin parameter is number
    slideWidthCalc: '', //temporary stored formula for box width, for reusage
    slideLayout: {}, //the current slide layout set. consists of "group", "scroll" and "margin"
    slideLayouts: [], //array of settings for optionally responsive slides layout
    slideLayoutsIndex: -1, //last index of (responsive) layout set
    sliderStyle: null,
    slidesStyle: null,
    slideStyle: null,
    styleSheet: null,
    clickTimer: null, //timerid for debouncing clicks on the navigation
    resizeTimer: null, //timerid for debouncing resize events
    resizeEvents: 'resize.flexi orientationchange.flexi' //resize events bound to window when 
  };

  let Interface = {
    /**
     * Initialize the slider on container 
     * @param {type} element
     * @param {type} settings
     * @returns {flexiSliderL#5.Interface}
     */
    initialize: function (element, settings) {
      this.$container = element;
      this.container = element[0];
      if (!this.container.id) {
        this.container.id = 'fs-' + Math.random().toString(36).substr(2, 10);
      }
      this.initStyles(settings);
      this.set(settings);
      this.log(this);
      return this;
    },
    
    initStyles: function(settings) {
      var style = document.createElement('style');
      style.appendChild(document.createTextNode(''));
      document.head.appendChild(style);
      this.styleSheet = style.sheet;
      var ruleIndex = 0; 
      $.map({
        slider: '',
        slides: settings.slides,
        slide: settings.slide
      }, (function(prop, key) {
        this.styleSheet.insertRule('#' + this.container.id + ' ' + prop + ' { }', ruleIndex);
        this[key+'Style'] = this.styleSheet.cssRules[ruleIndex++].style;
      }).bind(this));
      this.slidesStyle.transition = 'transform 0.5s ease-in-out';
    },
    /**
     * Set an option value
     * @param {type} name
     * @param {type} value
     * @returns {undefined}
     */
    set: function (name, value) {
      this.log('setting options', name, value);
      if (arguments.length === 1 && $.isPlainObject(arguments[0])) { //setting a bunch of options at once with object
        this.log('setting multiple options', arguments[0]);
        for (var optionName in $.extend({}, InitDefaults, RuntimeDefaults)) { //process the options in order 
          this.log('setting recursive option:', optionName, arguments[0][optionName]);
          this.set(optionName, arguments[0][optionName]); //set each object key to object value / recursive
        }
        return; //break execution for recursion
      }
      var settings = this.$container.data('flexi.settings'); //current stored settings
      if ($.isFunction(this.onSet[name])) { //check if a hook exists for setting this option
        value = {old: settings[name], new : value}; //save old and new value for comparison
        this.log(name, 'with hook:', value);
        if (this.onSet[name].call(this, value) !== false) { //when the custom set-method returns "false", the value is not set in settings
          this.log(name, 'setting to', value.new, ' (after hook)');
          settings[name] = value.new; //set the value in the options when function returned not false
        } else {
          this.log(name, 'not setting (hook took over)', value.new, $.isArray(value.new));
        }
      } else {
        this.log(name, 'setting to', value);
        settings[name] = value; //standard behaviour: set option to value
      }
      this.$container.data('flexi.settings', settings); //save settings back to data on container
    },
    /**
     * Get a slider setting value
     * @param {type} name the name of the setting
     * @param {type} defaultValue default value to return when setting is undefined
     * @returns value of current setting or the default value if undefined
     */
    get: function (name, defaultValue) {
      var settings = this.$container.data('flexi.settings');
      return settings[name] !== undefined ? settings[name] : defaultValue;
    },
    next: function (animate) {
      if (this.slidePos < this.slideCount - this.slideGroup) {
        this.slidePos++;
      } else {
        this.slidePos = 0;
      }
      if (animate === undefined) {
        animate = true;
      }
      this.updatePosition(animate);
    },
    prev: function (animate) {
      if (this.slidePos > 0) {
        this.slidePos--;
      } else {
        this.slidePos = this.slideCount - this.slideGroup;
      }
      if (animate === undefined) {
        animate = true;
      }
      this.updatePosition(animate);
    },
    updateSlides: function () {
      if (!this.containerWidth || this.slideGroup < 1) {
        return; //with no container width or slide group set layout is not calculable
      }
      var calc = '';
      if (this.slideGroup > 1) { //more than one slide
        calc += '(100% / ' + this.slideGroup + ')'; //calculated percentage 1/group
      } else {
        calc += '100%'; //one slide = full width
      }
      if (this.slideMargin) {
        //width of a box = (100% / group) - ((margin / group) * (group - 1))
        calc = '(' + calc + ' - ' + ((this.slideMargin / this.slideGroup) * (this.slideGroup - 1)) + this.slideMarginUnit + ')';
      }
      this.slideWidthCalc = calc; //store for later reuse
      this.slideStyle.flex = '0 0 calc(' + calc + ')'; //use calculated widths not pixels for better fit and less need to update the DOM
      this.slideStyle.margin = '0 ' + (this.slideMargin / 2) + this.slideMarginUnit; //add margin to slides
      this.updatePosition(false); //update the transformation of the slides container according to current position - without animation
      this.sliderStyle.opacity = 1; //show the slider with animation after load for nicer loading behavior
    },
    updateResize: function () {
      if ((this.containerWidth = this.container.offsetWidth) > 0) { //store current width, but do not update slides when the container has no width (like display:none) to avoid flicker
        for (var l = 0; l < this.slideLayouts.length; l++) { //search current layout
          if (this.slideLayouts[l].fromPx <= this.containerWidth
                  && this.slideLayouts[l].toPx >= this.containerWidth)
          {
            if (this.slidesLayoutIndex !== l) { //only set new layout if layout actually changed
              this.slidesLayoutIndex = l; //store current layout index to avoid resetting same values again
              this.set('slideLayout', this.slideLayouts[l]); //set layout option: this updates the slides css
            }
            return; //found matching layout, exit
          }
        }
      }
    },
    updatePosition: function (animate) {
      if (!this.container.offsetWidth) { //no offsetWidth means the container is not visible
        return; //do not update transformation when the container is not visible, this results in flicker
      }
      var calc = 'calc(', //build formula for positioning the slides container this.$slides / .flexi-slides
              margin = this.slideMargin ? this.slideMargin + this.slideMarginUnit : ''; //current margin
      if (this.slidePos) { //slide position is not at the beginning
        calc += '(' + this.slideWidthCalc + ' * -' + this.slidePos + ')'; //shift the slides the box slidePos times to the left
        if (margin) { //margin is set, add the margin to the position, still only using formular and not calculated pixels
          calc += ' - (' + (this.slideMargin * this.slidePos) + this.slideMarginUnit + ') - (' + margin + ' / 2)';
        }
      } else if (margin) { //at the beginning: shift slides half margin to left
        calc += '-' + margin + ' / 2';
      } else { //at the beginning and no margin: left position is 0
        calc += '0';
      }
      var slidesTransform = 'translate3d(' + calc + '),0,0)'; //new slides container styles
      if (animate === false) { //set styles with transform transition disabled
        //force the browser to repaint after setting the resizing class 
        //using setTimeout with small timeout, otherwise it is always animated
        this.slidesStyle.transition = 'none'; //disable transitions on container with css class
        window.setTimeout((function () { //repaint
          this.slidesStyle.transform = slidesTransform;  //translation by shifting calculated to the left
          window.setTimeout((function () { //repaint
            this.slidesStyle.transition = this.get('scrollTransition'); //re-enable transitions on container
          }).bind(this), 142);
        }).bind(this), 142);
      } else { //set styles with transform transition enabled
        this.slidesStyle.transform = slidesTransform; //set styles animated
      }
    }
  };

  let Hooks = {
    onEvent: {
      resizeTick: function () {
        if (this.container.offsetWidth !== this.containerWidth) {
          this.updateResize(false);
        }
      },
      resize: function () {
        clearTimeout(this.resizeTimer);
        if (!this.resizeTimer) {
          this.onEvent.resizeTick.call(this);
        }
        this.resizeTimer = setTimeout((function () {
          this.resizeTimer = 0;
        }).bind(this), this.get('resizeDebounceTimeout'));
      },
      mouseDown: function () {

      },
      mouseUp: function () {

      },
      click: function (action) {
        clearTimeout(this.clickTimer); //debounce resize event
        if (!this.clickTimer && $.isFunction(this[action])) { //make sure no debounce delay is set
          this[action](true);
        }
        this.clickTimer = setTimeout((function () { //delay next execution by resizeDebounceTimeout
          this.clickTimer = null; //allow new execution
        }).bind(this), this.get('clickDebounceTimeout'));
      }
    },
    onSet: {
      slides: function (value) {
        if (!value.old && value.new) { //value can only be set at startup
          this.$slides = $(value.new, this.$container);
          if (!this.$slides.length) {
            value.new = null;
            Debug.log('ERROR', 'slides container "' + value.new + '" not found!');
          }
        }
      },
      slideLayout: function (value) {
        var layout = value.new;
        if (layout.margin) {
          var margin = this.parseCSSValue(layout.margin);
          this.slideMargin = margin.value;
          this.slideMarginUnit = margin.unit;
        }
        if (layout.group) {
          this.slideGroup = layout.group;
        }
        if (layout.scroll) {
          this.slideScroll = layout.scroll;
        }
        this.updateSlides();
      },
      layout: function (value) {
        if (!$.isArray(value.new) || !value.new.length) {
          Debug.log('ERROR', 'Wrong layouts set, falling back to defaults. Need a valid array. Value passed:', value, value.new.length);
          value.new = RuntimeDefaults.layout;
        } 
        value.new.sort(function (a, b) {
          return (a.width ? a.width : 0) > (b.width ? b.width : 0) ? 1 : -1;
        });
        var fromPx = 0, toPx, slideLayout, layoutProperty;
        for (var r = 0, ro; r < value.new.length; r++) {
          ro = value.new[r];
          if (r === 0 && ro.width) {
            Debug.log('ERROR', 'it is mandatory to set one layout with no width set (or 0).');
            return false;
          }
          fromPx = ro.width ? ro.width : 0;
          toPx = (r < value.new.length - 1 ? value.new[r + 1].width - 1 : Infinity);
          slideLayout = { 
            fromPx: fromPx, 
            toPx: toPx
          };
          for (layoutProperty in RuntimeDefaults.layout[0]) {
            if (ro[layoutProperty] !== undefined) {
              slideLayout[layoutProperty] = ro[layoutProperty];
            }
          }
          this.slideLayouts.push(slideLayout);
          fromPx = toPx + 1;
        }
        return false; //do not set as local variable "layout"
      },
      slide: function (value) {
        this.$slide = $(value.new, this.$slides);
        this.slideCount = this.$slide.length;
        if (this.slideCount > 1) {
          this.$container.append(this.$navigation);
        }
        this.slidePos = 0;
      },
      scrollTransition: function(value) {
        this.slidesStyle.transition = value.new;
      },
      navigationTemplate: function (value) {
        if (!this.$navigation || value.old !== value.new) {
          if (this.$navigation) {
            this.$navigation.off('click.flexi');
          }
          this.$navigation = $(value.new);
          this.$navigation.on('click.flexi,mousedown.flexi,mouseup.flexi', '.flexi-prev,.flexi-next', (function (e) {
            var actions = {prev: 1, next: 1}, sender = e.currentTarget.className;
            for (var action in actions) {
              if (sender.indexOf(action) > -1) {
                this.onEvent.click.call(this, action);
                return false;
              }
            }
          }).bind(this));
        }
      },
      watchElementResize: function (value) {
        if (value.old !== value.new) {
          if (value.new) {
            $(window).off(this.resizeEvents);
            this.resizeTimer = setInterval(this.onEvent.resizeTick.bind(this), this.get('watchElementInterval')); //observe width with simple interval
          } else {
            clearInterval(this.resizeTimer);
            this.resizeTimer = null;
            $(window).on(this.resizeEvents, this.onEvent.resizeTick.bind(this));
            this.onEvent.resizeTick.call(this);
          }
        }
      }
    }
  };

  let Utils = {
    parseCSSValue: function (value) {
      try {
        var numValue, unit = '';
        if (typeof value === 'string') {
          numValue = parseFloat(value),
                  unit = value.replace(/[0-9\. ]+/, '');
        } else if (typeof value === 'number') {
          numValue = value;
        }
        if (!unit.length) {
          unit = 'px'; //fallback to px when unit is not given
        }
        return {value: numValue, unit: unit};
      } catch (e) {
        return {value: 0, unit: ''};
      }
    },
    log: function () {} //empty debug function, will be overriden with Debug::log when debug=true
  };

  /**
   * Debug object, extends slider when debug = true
   */
  let Debug = {
    /**
     * Log a message to console and apply all arguments
     */
    log: function () {
      if (window.console && console.log) { //ensure console is available
        var args = Array.prototype.slice.call(arguments, 0); //convert arguments to array
        args.unshift(':: ' + (new Error()).stack.split("\n")[1].split('@')[0] + '()'); //log calling function name
        args.unshift('flexiSlider'); //add custom caption to spot debug output
        console.log.apply(console, args); //apply to native console log method
      }
    }
  };

  //defaults to be set on initialization and not changed afterwards
  let InitDefaults = {
    navigationTemplate: '<nav><b class="flexi-prev"></b><b class="flexi-next"></b></nav>', //template for left / right navigation
    slider: '.flexi-slider', //selector for outer slides container
    slides: '.flexi-slides', //selector for (scrolling) inner slides container
    slide: '.flexi-slide' //selector for single slide container
  };

  //defaults for settings which can be changed after initializaition by calling $(..).flexiSlider('name of setting', value)
  let RuntimeDefaults = {
    debug: true,
    clickDebounceTimeout: 250, //ms to debounce the clicks on the navigation
    layout: [
      {//standard layout with no width set is mandatory
        group: 1, //how many slides to show at once
        scroll: 1, //how many slides to scroll when navigating
        margin: 0 //margin bewtween the slides (1em, 10px, 5.5%, ...). Defaults to px when it is a number without unit.
      }
    ],
    scrollTransition: '0.5s ease-in-out',
    resizeDebounceTimeout: 100, //ms to debounce the resize event
    watchElementInterval: 100, //ms in between the ticks to check for container resize, when watchElementResize=true
    watchElementResize: false //
  };

})(jQuery);