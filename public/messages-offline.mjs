// \0rolldown/runtime.js
var e = Object.create, t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.getPrototypeOf, a = Object.prototype.hasOwnProperty, o = (e, t, n) => () => {
	if (n) throw n[0];
	try {
		return e && (t = e(e = 0)), t;
	} catch (e) {
		throw n = [e], e;
	}
}, s = (e, t) => () => (t || (e((t = { exports: {} }).exports, t, t.exports), e = null), t.exports), c = (e, n) => {
	let r = {};
	for (var i in e) t(r, i, {
		get: e[i],
		enumerable: !0
	});
	return n || t(r, Symbol.toStringTag, { value: "Module" }), r;
}, l = (e, i, o, s) => {
	if (i && typeof i == "object" || typeof i == "function") for (var c = r(i), l = 0, u = c.length, d; l < u; l++) d = c[l], !a.call(e, d) && d !== o && t(e, d, {
		get: ((e) => i[e]).bind(null, d),
		enumerable: !(s = n(i, d)) || s.enumerable
	});
	return e;
}, u = (n, r, o) => (o = n == null ? {} : e(i(n)), l(r || !n || !n.__esModule || !a.call(n, "default") ? t(o, "default", {
	value: n,
	enumerable: !0
}) : o, n)), d = /* @__PURE__ */ s(((e) => {
	Object.defineProperty(e, "__esModule", { value: !0 }), e.parse = s, e.stringifySetCookie = c, e.serialize = c, e.stringifySetCookie = c, e.serialize = c;
	var t = /^[\u0021-\u003A\u003C\u003E-\u007E]+$/, n = /^[\u0021-\u003A\u003C-\u007E]*$/, r = /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i, i = /^[\u0020-\u003A\u003D-\u007E]*$/, a = Object.prototype.toString, o = /* @__PURE__ */ (() => {
		let e = function() {};
		return e.prototype = Object.create(null), e;
	})();
	function s(e, t) {
		let n = new o(), r = e.length;
		if (r < 2) return n;
		let i = t?.decode || f, a = 0;
		do {
			let t = u(e, a, r);
			if (t === -1) break;
			let o = l(e, a, r);
			if (t > o) {
				a = e.lastIndexOf(";", t - 1) + 1;
				continue;
			}
			let s = d(e, a, t);
			n[s] === void 0 && (n[s] = i(d(e, t + 1, o))), a = o + 1;
		} while (a < r);
		return n;
	}
	function c(e, a, o) {
		let s = typeof e == "object" ? e : {
			...o,
			name: e,
			value: String(a)
		}, c = (typeof a == "object" ? a : o)?.encode || encodeURIComponent;
		if (!t.test(s.name)) throw TypeError(`argument name is invalid: ${s.name}`);
		let l = s.value ? c(s.value) : "";
		if (!n.test(l)) throw TypeError(`argument val is invalid: ${s.value}`);
		let u = s.name + "=" + l;
		if (s.maxAge !== void 0) {
			if (!Number.isInteger(s.maxAge)) throw TypeError(`option maxAge is invalid: ${s.maxAge}`);
			u += "; Max-Age=" + s.maxAge;
		}
		if (s.domain) {
			if (!r.test(s.domain)) throw TypeError(`option domain is invalid: ${s.domain}`);
			u += "; Domain=" + s.domain;
		}
		if (s.path) {
			if (!i.test(s.path)) throw TypeError(`option path is invalid: ${s.path}`);
			u += "; Path=" + s.path;
		}
		if (s.expires) {
			if (!p(s.expires) || !Number.isFinite(s.expires.valueOf())) throw TypeError(`option expires is invalid: ${s.expires}`);
			u += "; Expires=" + s.expires.toUTCString();
		}
		if (s.httpOnly && (u += "; HttpOnly"), s.secure && (u += "; Secure"), s.partitioned && (u += "; Partitioned"), s.priority) switch (typeof s.priority == "string" ? s.priority.toLowerCase() : void 0) {
			case "low":
				u += "; Priority=Low";
				break;
			case "medium":
				u += "; Priority=Medium";
				break;
			case "high":
				u += "; Priority=High";
				break;
			default: throw TypeError(`option priority is invalid: ${s.priority}`);
		}
		if (s.sameSite) switch (typeof s.sameSite == "string" ? s.sameSite.toLowerCase() : s.sameSite) {
			case !0:
			case "strict":
				u += "; SameSite=Strict";
				break;
			case "lax":
				u += "; SameSite=Lax";
				break;
			case "none":
				u += "; SameSite=None";
				break;
			default: throw TypeError(`option sameSite is invalid: ${s.sameSite}`);
		}
		return u;
	}
	function l(e, t, n) {
		let r = e.indexOf(";", t);
		return r === -1 ? n : r;
	}
	function u(e, t, n) {
		let r = e.indexOf("=", t);
		return r < n ? r : -1;
	}
	function d(e, t, n) {
		let r = t, i = n;
		do {
			let t = e.charCodeAt(r);
			if (t !== 32 && t !== 9) break;
		} while (++r < i);
		for (; i > r;) {
			let t = e.charCodeAt(i - 1);
			if (t !== 32 && t !== 9) break;
			i--;
		}
		return e.slice(r, i);
	}
	function f(e) {
		if (e.indexOf("%") === -1) return e;
		try {
			return decodeURIComponent(e);
		} catch {
			return e;
		}
	}
	function p(e) {
		return a.call(e) === "[object Date]";
	}
}));
// node_modules/@supabase/ssr/dist/module/utils/helpers.js
function f(e) {
	let t = p.parse(e);
	return Object.keys(t ?? {}).map((e) => ({
		name: e,
		value: t[e]
	}));
}
var p, ee = o((() => {
	p = /* @__PURE__ */ u(d());
})), te = o((() => {}));
// node_modules/@supabase/ssr/dist/module/utils/chunker.js
async function ne(e, t) {
	let n = await t(e);
	if (n) return n;
	let r = [];
	for (let n = 0;; n++) {
		let i = await t(`${e}.${n}`);
		if (!i) break;
		r.push(i);
	}
	return r.length > 0 ? r.join("") : null;
}
var re = o((() => {}));
// node_modules/@supabase/ssr/dist/module/utils/base64url.js
function ie(e) {
	let t = [], n = (e) => {
		t.push(String.fromCodePoint(e));
	}, r = {
		utf8seq: 0,
		codepoint: 0
	}, i = 0, a = 0;
	for (let t = 0; t < e.length; t += 1) {
		let o = e.charCodeAt(t), s = oe[o];
		if (s > -1) for (i = i << 6 | s, a += 6; a >= 8;) ae(i >> a - 8 & 255, r, n), a -= 8;
		else if (s === -2) continue;
		else throw Error(`Invalid Base64-URL character "${e.at(t)}" at position ${t}`);
	}
	return t.join("");
}
function ae(e, t, n) {
	if (t.utf8seq === 0) {
		if (e <= 127) {
			n(e);
			return;
		}
		for (let n = 1; n < 6; n += 1) if (!(e >> 7 - n & 1)) {
			t.utf8seq = n;
			break;
		}
		if (t.utf8seq === 2) t.codepoint = e & 31;
		else if (t.utf8seq === 3) t.codepoint = e & 15;
		else if (t.utf8seq === 4) t.codepoint = e & 7;
		else throw Error("Invalid UTF-8 sequence");
		--t.utf8seq;
	} else if (t.utf8seq > 0) {
		if (e <= 127) throw Error("Invalid UTF-8 sequence");
		t.codepoint = t.codepoint << 6 | e & 63, --t.utf8seq, t.utf8seq === 0 && n(t.codepoint);
	}
}
var m, h, oe, se = o((() => {
	m = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split(""), h = " 	\n\r=".split(""), oe = (() => {
		let e = Array(128);
		for (let t = 0; t < e.length; t += 1) e[t] = -1;
		for (let t = 0; t < h.length; t += 1) e[h[t].charCodeAt(0)] = -2;
		for (let t = 0; t < m.length; t += 1) e[m[t].charCodeAt(0)] = t;
		return e;
	})();
})), ce = o((() => {
	ee(), te(), re(), se();
})), le = o((() => {})), ue = o((() => {})), de = o((() => {})), fe = o((() => {
	le(), ue(), de(), ce();
})), pe = /* @__PURE__ */ c({
	continuationState: () => g,
	continuing: () => y,
	enrollContinuation: () => ye,
	markRetired: () => ge,
	recoverContinuation: () => be,
	retireContinuation: () => _e
});
function me() {
	return x ||= new Promise((e, t) => {
		let n = indexedDB.open("algt-chat-continuation-v1", 1);
		n.onupgradeneeded = () => n.result.createObjectStore("guard"), n.onsuccess = () => e(n.result), n.onerror = () => t(n.error);
	}).catch((e) => {
		throw x = void 0, e;
	}), x;
}
async function g() {
	let e = (await me()).transaction("guard").objectStore("guard");
	return new Promise((t, n) => {
		let r = e.get("current");
		r.onsuccess = () => t(r.result ?? b), r.onerror = () => n(r.error);
	});
}
async function he(e) {
	let t = (await me()).transaction("guard", "readwrite"), n = t.objectStore("guard");
	return new Promise((r, i) => {
		let a, o = n.get("current");
		o.onsuccess = () => {
			try {
				n.put(e(o.result ?? b), "current");
			} catch (e) {
				a = e, t.abort();
			}
		}, t.oncomplete = () => r(), t.onabort = () => i(a ?? t.error), t.onerror = () => i(t.error);
	});
}
function ge(e) {
	try {
		localStorage.setItem("algt-chat-retired/" + e, "1");
	} catch {}
}
function _(e) {
	if (localStorage.getItem("algt-chat-retired/" + e)) throw Error("Sign in again to unlock messages.");
}
function _e(e) {
	return !e || typeof indexedDB > "u" ? Promise.resolve() : (ge(e), he((t) => t.enrollment && t.enrollment.session !== e ? t : {
		epoch: crypto.randomUUID(),
		retired: e
	}));
}
async function ve(e, t) {
	if (!/^sb-[a-zA-Z0-9_-]+-auth-token$/.test(e)) throw Error("Local ERP session is unavailable.");
	_(t.session);
	let n = new Map(f(document.cookie).map((e) => [e.name, e.value])), r = await ne(e, (e) => n.get(e));
	if (!r) throw Error("Sign in online to unlock cached messages.");
	let i = JSON.parse(r.startsWith("base64-") ? ie(r.slice(7)) : r);
	if (typeof i.access_token != "string" || typeof i.refresh_token != "string" || !i.refresh_token) throw Error("The local ERP session is incomplete.");
	let a = i.access_token.split(".");
	if (a.length !== 3 || !a[2]) throw Error("The local ERP session is incomplete.");
	let o = JSON.parse(ie(a[1]));
	if (o.sub !== t.account || typeof o.session_id != "string") throw Error("The ERP account changed.");
	if (Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", S(o.session_id))), (e) => e.toString(16).padStart(2, "0")).join("") !== t.session) throw Error("The ERP session changed. Sign in online.");
	let s = S(JSON.stringify([i.refresh_token, a[2]]));
	try {
		return await crypto.subtle.importKey("raw", s, "HKDF", !1, ["deriveKey"]);
	} finally {
		s.fill(0);
	}
}
async function v(e) {
	return crypto.subtle.deriveKey({
		name: "HKDF",
		hash: "SHA-256",
		salt: e.salt,
		info: S("ALGT ERP offline chat v1/" + e.account + "/" + e.session)
	}, await ve(e.cookieName, e), {
		name: "AES-KW",
		length: 256
	}, !1, ["wrapKey", "unwrapKey"]);
}
async function ye(e, t, n, r, i) {
	let a = {
		...t,
		cookieName: n,
		salt: crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(32)),
		wrapped: /* @__PURE__ */ new ArrayBuffer(0)
	};
	a.wrapped = await crypto.subtle.wrapKey("raw", r, await v(a), "AES-KW"), i.throwIfAborted(), await he((n) => {
		if (i.throwIfAborted(), _(t.session), n.epoch !== e || n.retired === t.session) throw Error("The ERP session changed during offline enrollment.");
		return {
			epoch: n.enrollment?.session === t.session ? n.epoch : crypto.randomUUID(),
			enrollment: a
		};
	});
}
async function y(e, t) {
	_(e);
	let n = await g();
	if (n.enrollment?.session !== e || n.enrollment.account !== t) throw Error("The local ERP session was retired.");
	await crypto.subtle.unwrapKey("raw", n.enrollment.wrapped, await v(n.enrollment), "AES-KW", "AES-GCM", !1, ["decrypt"]), _(e);
}
async function be() {
	let e = await g(), t = e.enrollment;
	if (!t) throw Error("Connect and open Messages with your ERP account to enable offline access.");
	let n = await crypto.subtle.unwrapKey("raw", t.wrapped, await v(t), "AES-KW", "AES-GCM", !1, ["encrypt", "decrypt"]), r = await g();
	if (_(t.session), r.epoch !== e.epoch || r.enrollment?.session !== t.session) throw Error("The local ERP session changed.");
	return {
		binding: {
			account: t.account,
			session: t.session,
			expectedProfile: t.expectedProfile
		},
		key: n
	};
}
var b, x, S, C = o((() => {
	fe(), b = { epoch: "initial" }, S = (e) => new TextEncoder().encode(e);
}));
// src/features/messages/offline-session.ts
C();
var w = new AbortController();
function T(e) {
	return e ? AbortSignal.any([w.signal, e]) : w.signal;
}
var E, D;
function xe(e) {
	E !== e && A(), E = e;
}
function O() {
	return E;
}
function Se(e, t, n) {
	if (!t || t !== E) throw Error("The messaging session changed.");
	(D?.account !== e || D.session !== t) && (D = {
		account: e,
		session: t,
		key: n
	});
}
function k(e, t) {
	if (D?.account !== e || D.session !== t) throw Error("Sign in online with this ERP account to unlock this device.");
	return D.key;
}
function Ce() {
	D = void 0;
}
function A() {
	let e = E;
	if (e && typeof localStorage < "u") {
		try {
			localStorage.setItem("algt-chat-retired/" + e, "1");
		} catch {}
		Promise.resolve().then(() => (C(), pe)).then((t) => t.retireContinuation(e)).catch(() => {});
	}
	w.abort(), w = new AbortController(), E = void 0, Ce();
}
var j = "/api/mobile/communications/v1";
// src/features/messages/client.ts
function we(e, t) {
	let n = new Headers(t.headers), r = O();
	r && n.set("X-ERP-Communication-Session", r);
	let i = T(t.signal ?? void 0);
	return i.throwIfAborted(), fetch(e, {
		...t,
		headers: n,
		signal: i
	});
}
var M = class extends Error {
	constructor(e, t) {
		super(t), this.status = e;
	}
};
async function Te(e) {
	if (!e.ok) {
		let t = await e.json().catch(() => null);
		throw new M(e.status, t?.error?.message || "The ERP could not complete this request.");
	}
	return e;
}
async function N(e, t = {}, n) {
	let r = await (await Te(await we(j, {
		method: "POST",
		credentials: "same-origin",
		cache: "no-store",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			op: e,
			args: t
		}),
		signal: n
	}))).json();
	if (r.success !== !0) throw Error("The ERP did not confirm this operation.");
	return r.data;
}
var P = /* @__PURE__ */ new Map();
async function F(e, t, n, r) {
	if (r = T(r), n) return N(e, {
		...t,
		clientMutationId: n
	}, r);
	let i = new TextEncoder().encode(JSON.stringify([
		O(),
		e,
		t
	])), a = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", i)), (e) => e.toString(16).padStart(2, "0")).join(""), o = P.get(a) ?? crypto.randomUUID();
	P.set(a, o);
	try {
		let n = await N(e, {
			...t,
			clientMutationId: o
		}, r);
		return P.delete(a), n;
	} catch (e) {
		throw e instanceof M && e.status < 500 && P.delete(a), e;
	}
}
async function Ee(e, t, n, r, i) {
	if (!t.size || t.size > 52428800) throw Error("Each file must contain data and be 50 MiB or smaller.");
	let a = (t.type || "application/octet-stream").split(";")[0], { uploadId: o } = await F("chat.uploadBegin", {
		conversationId: e,
		filename: t.name,
		mime: a,
		byteLength: t.size,
		...n && { kind: "voice" }
	}, r, i), s = await N("chat.uploadStatus", { uploadId: o }, i);
	if (!["verified", "attached"].includes(s.state)) {
		let e = await (await Te(await we(j + "/uploads/" + encodeURIComponent(o), {
			method: "POST",
			credentials: "same-origin",
			cache: "no-store",
			headers: { "Content-Type": a },
			body: t,
			signal: i
		}))).json();
		if (!e.success || !["verified", "attached"].includes(e.data?.state)) throw Error("File verification is incomplete.");
	}
	return o;
}
// src/features/messages/vault.ts
var De = "algt-messages-v1";
function I(e) {
	return new Promise((t, n) => {
		e.onsuccess = () => t(e.result), e.onerror = () => n(e.error);
	});
}
var L;
function R() {
	if (!L) {
		let e = indexedDB.open(De, 1);
		e.onupgradeneeded = () => {
			e.result.createObjectStore("keys"), e.result.createObjectStore("records");
		}, L = I(e).catch((e) => {
			throw L = void 0, e;
		});
	}
	return L;
}
async function z(e, t) {
	let n = (await R()).transaction(e, "readwrite"), r = new Promise((e, t) => {
		n.oncomplete = () => e(), n.onabort = () => t(n.error), n.onerror = () => t(n.error);
	});
	return t(n.objectStore(e)), r;
}
var Oe = class {
	constructor(e, t, n, r = !1) {
		this.account = e, this.session = t, this.profileId = n, this.enforceDeviceEpoch = r;
	}
	async current() {
		this.enforceDeviceEpoch && await y(this.session, this.account);
	}
	path(e) {
		return this.account + "/" + e;
	}
	async encrypt(e, t) {
		let n = this.path(e), r = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(12)), i = k(this.account, this.session), a = await crypto.subtle.encrypt({
			name: "AES-GCM",
			iv: r,
			additionalData: new TextEncoder().encode(n)
		}, i, t);
		if (k(this.account, this.session) !== i) throw Error("The messaging session changed.");
		return await this.current(), {
			iv: r,
			cipher: a
		};
	}
	async bytes(e, t) {
		let n = await this.encrypt(e, t);
		await z("records", (t) => {
			t.put(n, this.path(e));
		});
	}
	async readBytes(e) {
		let t = this.path(e), n = await I((await R()).transaction("records").objectStore("records").get(t));
		if (!n) return null;
		let r = k(this.account, this.session), i = await crypto.subtle.decrypt({
			name: "AES-GCM",
			iv: n.iv,
			additionalData: new TextEncoder().encode(t)
		}, r, n.cipher);
		if (k(this.account, this.session) !== r) throw Error("The messaging session changed.");
		return await this.current(), i;
	}
	async put(e, t) {
		await this.bytes(e, new TextEncoder().encode(JSON.stringify(t)).buffer);
	}
	async get(e) {
		let t = await this.readBytes(e);
		return t ? JSON.parse(new TextDecoder().decode(t)) : null;
	}
	async list(e) {
		let t = this.path(e);
		return (await I((await R()).transaction("records").objectStore("records").getAllKeys(IDBKeyRange.bound(t, t + "￿")))).map((e) => String(e).slice(this.account.length + 1));
	}
	async clear(e) {
		let t = this.path(e);
		await z("records", (e) => {
			e.delete(IDBKeyRange.bound(t, t + "￿"));
		});
	}
	async drop(e) {
		await z("records", (t) => {
			t.delete(this.path(e));
		});
	}
	async reconcile(e, t) {
		let n = new Map(e.map((e) => [e.id, e.changeSeq])), r = (await this.list("cache/")).filter((e) => e.endsWith("/history"));
		for (let e of r) {
			t.throwIfAborted();
			let r = await this.get(e);
			r && (!n.has(r.conversation.id) || n.get(r.conversation.id) !== r.conversation.changeSeq) && await this.clear("cache/" + r.conversation.id + "/");
		}
	}
	async intents(e) {
		let t = await this.list("out/" + e + "/");
		return (await Promise.all(t.map((e) => this.get(e)))).filter((e) => !!e).sort((e, t) => e.createdAt.localeCompare(t.createdAt));
	}
	async persistIntent(e, t, n) {
		if (t.length !== e.uploads.length || t.some((e) => !e.size || e.size > 52428800)) throw Error("Each file must contain data and be 50 MiB or smaller.");
		for (let [n, r] of t.entries()) await this.bytes("payload/" + e.id + "/" + e.uploads[n].id, await r.arrayBuffer());
		let r = "out/" + e.conversationId + "/" + e.id, i = await this.encrypt(r, new TextEncoder().encode(JSON.stringify(e)).buffer);
		await z("records", (t) => {
			t.add(i, this.path(r)), n && t.delete(this.path(n));
			for (let n of e.uploads) t.delete(this.path("compose-file/" + e.conversationId + "/" + n.id));
		});
	}
	save(e) {
		return this.put("out/" + e.conversationId + "/" + e.id, e);
	}
	async remove(e) {
		await this.drop("out/" + e.conversationId + "/" + e.id), await this.clear("payload/" + e.id + "/");
	}
	async send(e, t) {
		if (t = T(t), O() !== this.session || e.session !== this.session || e.state !== "queued") throw Error("Review this device draft before sending.");
		let [n, r, i] = await Promise.all([
			N("communications.profile", {}, t),
			N("chat.conversation", {
				conversationId: e.conversationId,
				mode: "participant"
			}, t),
			N("policy.status", {}, t)
		]);
		if (n.profileId !== this.profileId || !n.chat.configured || !n.chat.eligible || !i.accepted || !i.currentVersion || i.currentVersion !== e.termsVersion || r.id !== e.conversationId) throw Error("Review your session, access and terms before sending.");
		if (e.preparedArgs) try {
			await F("chat.send", e.preparedArgs, e.id, t), await this.remove(e);
			return;
		} catch (t) {
			if (!(t instanceof M) || t.status !== 404 || !e.uploads.length || e.uploadSession === this.session) throw t;
		}
		e.uploadSession !== this.session && (e = {
			...e,
			uploadSession: this.session,
			preparedArgs: void 0,
			uploads: e.uploads.map((e) => ({
				...e,
				uploadKey: crypto.randomUUID()
			}))
		}, await this.save(e));
		let a = {
			conversationId: r.id,
			...e.body && { body: e.body },
			mentionProfileIds: e.mentions,
			...e.replyId && { replyToMessageId: e.replyId }
		};
		e.dmsToken && (a.dmsRef = await N("chat.resolveDmsReference", { token: e.dmsToken }, t));
		let o = [];
		for (let n of e.uploads) {
			let i = await this.readBytes("payload/" + e.id + "/" + n.id);
			if (!i) throw Error("A local attachment could not be recovered.");
			o.push(await Ee(r.id, new File([i], n.name, { type: n.mime }), n.voice, n.uploadKey ?? n.id, t));
		}
		a.uploadIds = o, await this.save({
			...e,
			preparedArgs: a
		}), await F("chat.send", a, e.id, t), await this.remove(e);
	}
};
// src/features/messages/offline-entry.ts
C();
var B = document.getElementById("work"), V = 0, H, U, W = /* @__PURE__ */ new Set();
function G() {
	V++, H = void 0, U &&= (U.onstop = null, U.stream.getTracks().forEach((e) => e.stop()), U.state !== "inactive" && U.stop(), void 0);
	for (let e of W) URL.revokeObjectURL(e);
	W.clear(), B.replaceChildren();
}
function K(e, t, n = B) {
	let r = document.createElement(e);
	return t !== void 0 && (r.textContent = t), n.append(r), r;
}
function q(e) {
	K("p", e instanceof Error ? e.message : "Cached chat is unavailable.").setAttribute("role", "alert");
}
function J(e, t, n = B) {
	let r = K("button", e, n);
	return r.type = "button", r.onclick = () => {
		r.disabled = !0, Promise.resolve().then(t).catch(q).finally(() => {
			r.disabled = !1;
		});
	}, r;
}
async function Y(e) {
	if (!H || e !== V || document.hidden) throw Error("Open Messages again to verify this device.");
	if (await y(H.session, H.account), e !== V || document.hidden) throw Error("The session changed.");
}
function ke() {
	K("h1", "Messages"), K("p", "Offline · cached on this device"), J("Reconnect to ERP", () => location.reload());
}
async function Ae(e, t, n, r) {
	J(t.filename, async () => {
		await Y(n);
		let i = await e.readBytes("cache/" + t.conversationId + "/media/" + e.session + "/" + t.id);
		if (!i) throw Error("This file has not been downloaded on this device.");
		await Y(n);
		let a = URL.createObjectURL(new Blob([i], { type: t.mime }));
		if (W.add(a), ["audio", "voice"].includes(t.kind)) {
			let e = K("audio", void 0, r);
			e.controls = !0, e.src = a;
		} else if (t.kind === "video") {
			let e = K("video", void 0, r);
			e.controls = !0, e.src = a;
		} else if (t.kind === "image") {
			let e = K("img", void 0, r);
			e.alt = t.filename, e.src = a;
		} else {
			let e = K("a", "Save cached file", r);
			e.href = a, e.download = t.filename, e.click();
		}
	}, r);
}
async function X(e, t, n) {
	await Y(n);
	let [r, i, a] = await Promise.all([
		e.get("cache/" + t.id + "/history"),
		e.get("policy"),
		e.intents(t.id)
	]);
	if (await Y(n), !r || r.session !== e.session) throw Error("Open this conversation online before using it offline.");
	B.replaceChildren(), ke(), J("Back to inbox", () => Z(!1)), K("h2", t.title);
	for (let t of r.messages) {
		let r = K("article");
		K("strong", t.senderName ?? "System notice", r), K("small", " · " + new Date(t.sentAt).toLocaleString(), r), t.reply && K("blockquote", t.reply.deleted ? "Message deleted" : t.reply.body ?? "Reply to attachment", r);
		let i = K("p", t.deleted ? "Message deleted" : t.body, r);
		if (i.dir = "auto", !t.deleted) for (let i of t.attachments) await Ae(e, i, n, r);
	}
	for (let t of a) {
		let n = K("article");
		K("strong", t.state === "queued" && t.session === e.session ? "Pending delivery" : "Device draft · review online before sending", n), K("p", t.body, n), K("p", t.uploads.map((e) => e.name).join(", "), n);
	}
	if (i?.session !== e.session || !i.policy.accepted || !i.policy.currentVersion) {
		K("p", "Connect to ERP to check the current communication terms before sending.");
		return;
	}
	let o = i.policy.currentVersion, s = K("fieldset");
	K("legend", "Queue a message", s);
	let c = K("textarea", void 0, K("label", "Message", s));
	c.dir = "auto", c.maxLength = 32e3;
	let l = "cold-compose/" + t.id;
	c.value = await e.get(l) ?? "";
	let u = Promise.resolve();
	c.oninput = () => {
		let t = c.value;
		u = u.catch(() => {}).then(() => e.put(l, t)).catch(q);
	};
	let d = K("input", void 0, K("label", "Attachments · 50 MiB each", s));
	d.type = "file", d.multiple = !0;
	let f, p = J("Record voice note", async () => {
		if (U?.state === "recording") {
			U.stop();
			return;
		}
		if (await Y(n), typeof MediaRecorder > "u" || !navigator.mediaDevices?.getUserMedia) throw Error("Voice recording is unavailable here.");
		let e = ["audio/webm", "audio/mp4"].find((e) => MediaRecorder.isTypeSupported(e));
		if (!e) throw Error("No supported recording format.");
		let t = await navigator.mediaDevices.getUserMedia({ audio: !0 });
		try {
			await Y(n), U = new MediaRecorder(t, { mimeType: e });
		} catch (e) {
			throw t.getTracks().forEach((e) => e.stop()), e;
		}
		let r = U, i = [], a = 0;
		p.textContent = "Stop recording", r.ondataavailable = (e) => {
			a += e.data.size, a > 52428800 ? r.state === "recording" && r.stop() : i.push(e.data);
		}, r.onstop = () => {
			t.getTracks().forEach((e) => e.stop()), U = void 0, n === V && (p.textContent = "Record voice note", a > 52428800 || !a ? q(Error("Recording unavailable or over 50 MiB.")) : (f = new File(i, e === "audio/webm" ? "Voice note.webm" : "Voice note.m4a", { type: e }), K("p", "Voice note attached.", s)));
		}, r.start(1e3);
	}, s);
	J("Queue on this device", async () => {
		if (await Y(n), U) throw Error("Stop recording before queuing this message.");
		await u;
		let r = Array.from(d.files ?? []);
		if (f && r.push(f), !c.value.trim() && !r.length) throw Error("Write a message or attach a file.");
		let i = {
			id: crypto.randomUUID(),
			session: e.session,
			conversationId: t.id,
			body: c.value.trim(),
			mentions: [],
			termsVersion: o,
			state: "queued",
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			uploads: r.map((e) => ({
				id: crypto.randomUUID(),
				name: e.name,
				mime: e.type || "application/octet-stream",
				voice: e === f
			}))
		};
		await e.persistIntent(i, r, l), await X(e, t, n);
	}, s);
}
async function Z(e = !0) {
	G();
	let t = V;
	ke();
	try {
		let n = await be();
		if (t !== V || document.hidden) return;
		H = n.binding, xe(H.session), Se(H.account, H.session, n.key);
		let r = new Oe(H.account, H.session, H.expectedProfile, !0), i = await Promise.all([!1, !0].map((e) => r.get("cache/inbox/" + e)));
		await Y(t);
		let a = i.flatMap((e) => e?.session === r.session ? e.items : []), o = new URL(location.href).searchParams.get("conversationId"), s = e && a.find((e) => e.id === o);
		if (s) {
			await X(r, s, t);
			return;
		}
		K("h2", "Cached conversations");
		for (let e of a) J(e.title + (e.archived ? " · Archived" : ""), () => X(r, e, t));
		a.length || K("p", "No conversations are cached for this session.");
	} catch (e) {
		t === V && q(e);
	}
}
function Q() {
	G(), A(), K("p", "Your ERP account or session changed. Reconnect to continue.");
}
window.addEventListener("storage", (e) => {
	H && e.key === "algt-chat-retired/" + H.session && Q();
});
var $ = typeof BroadcastChannel < "u" ? new BroadcastChannel("algt-auth-state") : null;
$ && ($.onmessage = Q), document.addEventListener("visibilitychange", () => {
	document.hidden ? (G(), K("p", "Messages locked while this window is hidden.")) : Z();
}), window.addEventListener("online", () => {
	G(), location.reload();
}), location.pathname === "/messages" ? Z() : location.replace("/messages");
