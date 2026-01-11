/**
 * utils.js
 */

const mathABS = Math.abs;
const mathCOS = Math.cos;
const mathSIN = Math.sin;
const mathPOW = Math.pow;
const mathSQRT = Math.sqrt;
const mathATAN2 = Math.atan2;
const mathPI = Math.PI;

const UtilsHelper = {};

function touchStart(e) {
	const element = e.currentTarget;
	const preventDefault = !element._skipPrevent;

	UtilsHelper.mousifyTouchEvent(e);
	window.setUsingTouch(true);
	if (preventDefault) {
		e.preventDefault();
		e.stopPropagation();
	}
	if (element.onmouseover)
		element.onmouseover(e);
	element._isHovering = true;
}

function touchMove(e) {
	const element = e.currentTarget;
	let isHovering = element._isHovering;
	const preventDefault = !element._skipPrevent;

	UtilsHelper.mousifyTouchEvent(e);
	window.setUsingTouch(true);
	if (preventDefault) {
		e.preventDefault();
		e.stopPropagation();
	}
	if (UtilsHelper.containsPoint(element, e.pageX, e.pageY)) {
		if (!isHovering) {
			if (element.onmouseover)
				element.onmouseover(e);
			isHovering = true;
		}
	} else {
		if (isHovering) {
			if (element.onmouseout)
				element.onmouseout(e);
			isHovering = false;
		}
	}
	element._isHovering = isHovering;
}

function touchEnd(e) {
	const element = e.currentTarget;
	let isHovering = element._isHovering;
	const preventDefault = !element._skipPrevent;

	UtilsHelper.mousifyTouchEvent(e);
	window.setUsingTouch(true);
	if (preventDefault) {
		e.preventDefault();
		e.stopPropagation();
	}
	if (isHovering) {
		if (element.onclick)
			element.onclick(e);
		if (element.onmouseout)
			element.onmouseout(e);
		isHovering = false;
	}
	element._isHovering = isHovering;
}

UtilsHelper.findMiddlePoint = function (tmp1, tmp2, type1, type2) {
	const getCoords = (obj, type) => {
		switch (type) {
			case 0: return { x: obj.x, y: obj.y };
			case 1: return { x: obj.x1, y: obj.y1 };
			case 2: return { x: obj.x2, y: obj.y2 };
			case 3: return { x: obj.x3, y: obj.y3 };
			default: throw new Error("Invalid type");
		}
	};
	const tmpXY1 = getCoords(tmp1, type1);
	const tmpXY2 = getCoords(tmp2, type2);
	return {
		x: (tmpXY1.x + tmpXY2.x) / 2,
		y: (tmpXY1.y + tmpXY2.y) / 2
	};
};

UtilsHelper.distanceBetween = function (e, t) {
	try {
		let x1 = (t.x2 || t.x);
		let y1 = (t.y2 || t.y);
		let x2 = (e.x2 || e.x);
		let y2 = (e.y2 || e.y);
		return Math.sqrt((x2 -= x1) * x2 + (y2 -= y1) * y2);
	} catch (e) {
		return Infinity;
	}
};

UtilsHelper.randInt = function (min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
};

UtilsHelper.toRad = function (angle) {
	return angle * (mathPI / 180);
};

UtilsHelper.randFloat = function (min, max) {
	return Math.random() * (max - min) + min;
};

UtilsHelper.lerp = function (value1, value2, amount) {
	return value1 + (value2 - value1) * amount;
};

UtilsHelper.decel = function (val, cel) {
	if (val > 0)
		val = Math.max(0, val - cel);
	else if (val < 0)
		val = Math.min(0, val + cel);
	return val;
};

UtilsHelper.getDistance = function (x1, y1, x2, y2) {
	return mathSQRT((x2 -= x1) * x2 + (y2 -= y1) * y2);
};

UtilsHelper.getDirection = function (x1, y1, x2, y2) {
	return mathATAN2(y1 - y2, x1 - x2);
};

UtilsHelper.getDirect = function (tmp1, tmp2, type1, type2) {
	const tmpXY1 = {
		x: type1 === 0 ? tmp1.x : type1 === 1 ? tmp1.x1 : type1 === 2 ? tmp1.x2 : type1 === 3 && tmp1.x3,
		y: type1 === 0 ? tmp1.y : type1 === 1 ? tmp1.y1 : type1 === 2 ? tmp1.y2 : type1 === 3 && tmp1.y3,
	};
	const tmpXY2 = {
		x: type2 === 0 ? tmp2.x : type2 === 1 ? tmp2.x1 : type2 === 2 ? tmp2.x2 : type2 === 3 && tmp2.x3,
		y: type2 === 0 ? tmp2.y : type2 === 1 ? tmp2.y1 : type2 === 2 ? tmp2.y2 : type2 === 3 && tmp2.y3,
	};
	return mathATAN2(tmpXY1.y - tmpXY2.y, tmpXY1.x - tmpXY2.x);
};

UtilsHelper.getAngleDist = function (a, b) {
	var p = mathABS(b - a) % (mathPI * 2);
	return (p > mathPI ? (mathPI * 2) - p : p);
};

UtilsHelper.isNumber = function (n) {
	return (typeof n == "number" && !isNaN(n) && isFinite(n));
};

UtilsHelper.isString = function (s) {
	return (s && typeof s == "string");
};

UtilsHelper.kFormat = function (num) {
	return num > 999 ? (num / 1000).toFixed(1) + 'k' : num;
};

UtilsHelper.capitalizeFirst = function (string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
};

UtilsHelper.fixTo = function (n, v) {
	return parseFloat(n.toFixed(v));
};

UtilsHelper.sortByPoints = function (a, b) {
	return parseFloat(b.points) - parseFloat(a.points);
};

UtilsHelper.lineInRect = function (recX, recY, recX2, recY2, x1, y1, x2, y2) {
	var minX = x1;
	var maxX = x2;
	if (x1 > x2) {
		minX = x2;
		maxX = x1;
	}
	if (maxX > recX2)
		maxX = recX2;
	if (minX < recX)
		minX = recX;
	if (minX > maxX)
		return false;
	var minY = y1;
	var maxY = y2;
	var dx = x2 - x1;
	if (Math.abs(dx) > 0.0000001) {
		var a = (y2 - y1) / dx;
		var b = y1 - a * x1;
		minY = a * minX + b;
		maxY = a * maxX + b;
	}
	if (minY > maxY) {
		var tmp = maxY;
		maxY = minY;
		minY = tmp;
	}
	if (maxY > recY2)
		maxY = recY2;
	if (minY < recY)
		minY = recY;
	if (minY > maxY)
		return false;
	return true;
};

UtilsHelper.containsPoint = function (element, x, y) {
	var bounds = element.getBoundingClientRect();
	var left = bounds.left + window.scrollX;
	var top = bounds.top + window.scrollY;
	var width = bounds.width;
	var height = bounds.height;

	var insideHorizontal = x > left && x < left + width;
	var insideVertical = y > top && y < top + height;
	return insideHorizontal && insideVertical;
};

UtilsHelper.mousifyTouchEvent = function (event) {
	var touch = event.changedTouches[0];
	event.screenX = touch.screenX;
	event.screenY = touch.screenY;
	event.clientX = touch.clientX;
	event.clientY = touch.clientY;
	event.pageX = touch.pageX;
	event.pageY = touch.pageY;
};

UtilsHelper.hookTouchEvents = function (element, skipPrevent) {
	element._skipPrevent = skipPrevent;
	element._isHovering = false;

	var options = { passive: false };
	element.addEventListener("touchstart", UtilsHelper.checkTrusted(touchStart), options);
	element.addEventListener("touchmove", UtilsHelper.checkTrusted(touchMove), options);
	element.addEventListener("touchend", UtilsHelper.checkTrusted(touchEnd), options);
	element.addEventListener("touchcancel", UtilsHelper.checkTrusted(touchEnd), options);
	element.addEventListener("touchleave", UtilsHelper.checkTrusted(touchEnd), options);
};

UtilsHelper.removeAllChildren = function (element) {
	while (element.hasChildNodes()) {
		element.removeChild(element.lastChild);
	}
};

UtilsHelper.generateElement = function (config) {
	var element = document.createElement(config.tag || "div");

	function bind(configValue, elementValue) {
		if (config[configValue])
			element[elementValue] = config[configValue];
	}
	bind("text", "textContent");
	bind("html", "innerHTML");
	bind("class", "className");
	for (var key in config) {
		switch (key) {
			case "tag":
			case "text":
			case "html":
			case "class":
			case "style":
			case "hookTouch":
			case "parent":
			case "children":
				continue;
			default:
				break;
		}
		element[key] = config[key];
	}
	if (element.onclick)
		element.onclick = UtilsHelper.checkTrusted(element.onclick);
	if (element.onmouseover)
		element.onmouseover = UtilsHelper.checkTrusted(element.onmouseover);
	if (element.onmouseout)
		element.onmouseout = UtilsHelper.checkTrusted(element.onmouseout);
	if (config.style) {
		element.style.cssText = config.style;
	}
	if (config.hookTouch) {
		UtilsHelper.hookTouchEvents(element, config.skipPrevent);
	}
	if (config.parent) {
		config.parent.appendChild(element);
	}
	if (config.children) {
		for (var i = 0; i < config.children.length; i++) {
			element.appendChild(config.children[i]);
		}
	}
	return element;
}

UtilsHelper.eventIsTrusted = function (ev) {
	if (ev && typeof ev.isTrusted == "boolean") {
		return ev.isTrusted;
	} else {
		return true;
	}
}

UtilsHelper.checkTrusted = function (callback) {
	return function (ev) {
		if (ev && ev instanceof Event && UtilsHelper.eventIsTrusted(ev)) {
			callback(ev);
		} else { }
	}
}

UtilsHelper.randomString = function (length) {
	var text = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (var i = 0; i < length; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
};

UtilsHelper.countInArray = function (array, val) {
	var count = 0;
	for (var i = 0; i < array.length; i++) {
		if (array[i] === val) count++;
	}
	return count;
};

UtilsHelper.getDist = function (tmp1, tmp2, type1, type2) {
	let tmpXY1 = {
		x: type1 == 0 ? tmp1.x : type1 == 1 ? tmp1.x1 : type1 == 2 ? tmp1.x2 : type1 == 3 && tmp1.x3,
		y: type1 == 0 ? tmp1.y : type1 == 1 ? tmp1.y1 : type1 == 2 ? tmp1.y2 : type1 == 3 && tmp1.y3,
	};
	let tmpXY2 = {
		x: type2 == 0 ? tmp2.x : type2 == 1 ? tmp2.x1 : type2 == 2 ? tmp2.x2 : type2 == 3 && tmp2.x3,
		y: type2 == 0 ? tmp2.y : type2 == 1 ? tmp2.y1 : type2 == 2 ? tmp2.y2 : type2 == 3 && tmp2.y3,
	};
	return mathSQRT((tmpXY2.x -= tmpXY1.x) * tmpXY2.x + (tmpXY2.y -= tmpXY1.y) * tmpXY2.y);
};

export {
	mathABS,
	mathCOS,
	mathSIN,
	mathPOW,
	mathSQRT,
	mathATAN2,
	mathPI,
	UtilsHelper as default,
	UtilsHelper as UTILS,
	UtilsHelper.findMiddlePoint as findMiddlePoint,
	UtilsHelper.distanceBetween as distanceBetween,
	UtilsHelper.randInt as randInt,
	UtilsHelper.toRad as toRad,
	UtilsHelper.randFloat as randFloat,
	UtilsHelper.lerp as lerp,
	UtilsHelper.decel as decel,
	UtilsHelper.getDistance as getDistance,
	UtilsHelper.getDirection as getDirection,
	UtilsHelper.getDirect as getDirect,
	UtilsHelper.getAngleDist as getAngleDist,
	UtilsHelper.isNumber as isNumber,
	UtilsHelper.isString as isString,
	UtilsHelper.kFormat as kFormat,
	UtilsHelper.capitalizeFirst as capitalizeFirst,
	UtilsHelper.fixTo as fixTo,
	UtilsHelper.sortByPoints as sortByPoints,
	UtilsHelper.lineInRect as lineInRect,
	UtilsHelper.containsPoint as containsPoint,
	UtilsHelper.mousifyTouchEvent as mousifyTouchEvent,
	UtilsHelper.hookTouchEvents as hookTouchEvents,
	UtilsHelper.removeAllChildren as removeAllChildren,
	UtilsHelper.generateElement as generateElement,
	UtilsHelper.eventIsTrusted as eventIsTrusted,
	UtilsHelper.checkTrusted as checkTrusted,
	UtilsHelper.randomString as randomString,
	UtilsHelper.countInArray as countInArray,
	UtilsHelper.getDist as getDist
};