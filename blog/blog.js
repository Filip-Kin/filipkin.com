// ─────────────────────────────────────────────────────────────────────────────
// Constants & State
// ─────────────────────────────────────────────────────────────────────────────

const monthNames = {
	en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
	pl: ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"],
};

const state = {
	year: new Date().getFullYear(),
	month: new Date().getMonth() + 1, // 1–12
	fetched: new Set(),
	container: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pads a number to two digits with leading zero if necessary.
 * @param {number} n - The number to pad.
 * @returns {string} Two-digit string representation of n.
 */
function pad(n) {
	return String(n).padStart(2, "0");
}

/**
 * Decrements the state's month, rolling over into the previous year if month < 1.
 */
function decrementMonth() {
	state.month--;
	if (state.month < 1) {
		state.month = 12;
		state.year--;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Archive Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads and renders the archive post HTML and data for a given year/month.
 * @param {number} year - The year to load.
 * @param {number} month - The month to load (1–12).
 * @returns {Promise<boolean>} True if loaded successfully; false otherwise.
 */
async function loadArchive(year, month) {
	const base = `${year}/${pad(month)}`;
	const htmlPath = `${base}/index.html`;

	try {
		const htmlRes = await fetch(htmlPath, { cache: "no-store" });
		if (!htmlRes.ok) return false;

		const htmlText = await htmlRes.text();
		const tmp = document.createElement("div");
		tmp.innerHTML = htmlText.trim();

		const post = tmp.querySelector(".post");
		if (!post) return false;

		removeOldHeading(post);
		insertLocalizedHeadings(post, year, month);
		await loadDataAndInjectBars(base, post);
		rewriteImagePaths(post, base);

		post.querySelectorAll(".image-grid").forEach((gridEl) => {
			requestAnimationFrame(() => tagImageOrientation(gridEl));
		});

		state.container.appendChild(post);
		state.fetched.add(base);
		return true;
	} catch (err) {
		console.warn(`Failed to load ${htmlPath}:`, err);
		return false;
	}
}

/**
 * Attempts to load the next-oldest archive by decrementing month repeatedly.
 * Stops once a valid post is loaded or year < 2020.
 */
async function loadNext() {
	do {
		decrementMonth();
		if (state.year < 2020) return;
	} while (!(await loadArchive(state.year, state.month)));
}

// is the page tall enough to scroll?
function isScrollable(threshold = 50) {
	const doc = document.documentElement;
	return doc.scrollHeight - window.innerHeight > threshold;
}

// wait one paint so layout/height is correct
function nextFrame() {
	return new Promise((r) => requestAnimationFrame(() => r()));
}

// keep loading older months until page can scroll (or we hit a limit)
async function ensureScrollable({ maxExtraMonths = 5 } = {}) {
	let loaded = 0;

	// let images/styles apply before measuring
	await nextFrame();

	while (!isScrollable() && state.year >= 2020 && loaded < maxExtraMonths) {
		await loadNext(); // loads one more older month
		await nextFrame(); // let layout update before re-checking
		loaded++;
	}
}

/**
 * Initializes the archive loading: loads current month or falls back to older.
 */
async function initArchive() {
	state.container = document.getElementById("posts");
	if (!state.container) return;

	const ok = await loadArchive(state.year, state.month);
	if (!ok) {
		// if current month missing, step back until something loads
		await loadNext();
	}

	// After we have at least one month, make sure the page can scroll
	await ensureScrollable({ maxExtraMonths: 4 }); // tweak limit as you like
}

/**
 * Rewrite any relative ./… image srcs so they point into the month folder.
 * @param {HTMLElement} postEl – the .post element you parsed
 * @param {string}      base  – the folder path, e.g. "2025/07"
 */
function rewriteImagePaths(postEl, base) {
	postEl.querySelectorAll("img").forEach((img) => {
		const src = img.getAttribute("src");
		// only rewrite "./something.jpg"
		if (src && src.startsWith("./")) {
			// drop the "./" and prepend the folder
			img.src = `${base}/${src.slice(2)}`;
		}
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Heading Injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Removes any existing <h2> heading from a post element.
 * @param {HTMLElement} postEl - The .post element.
 */
function removeOldHeading(postEl) {
	const old = postEl.querySelector("h2");
	if (old) old.remove();
}

/**
 * Inserts localized <h2> headings in both English and Polish at the top of a post.
 * @param {HTMLElement} postEl - The .post element.
 * @param {number} year - The year for the heading.
 * @param {number} month - The month (1–12) for the heading.
 */
function insertLocalizedHeadings(postEl, year, month) {
	["en", "pl"].forEach((lang) => {
		const h2 = document.createElement("h2");
		h2.lang = lang;
		h2.textContent = `${monthNames[lang][month - 1]} ${year}`;
		postEl.insertBefore(h2, postEl.firstChild);
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Loading & Bar Injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches data.json for a given base path and injects activity and mood bars.
 * @param {string} base - The folder path, e.g. "2025/07".
 * @param {HTMLElement} postEl - The .post element to inject into.
 */
async function loadDataAndInjectBars(base, postEl) {
	try {
		const res = await fetch(`${base}/data.json`, { cache: "no-store" });
		if (!res.ok) return;

		const data = await res.json();
		injectBar(postEl, "Activities", data.activities);
		injectBar(postEl, "Mood", data.mood);
	} catch (err) {
		console.warn(`Failed to load data.json for ${base}:`, err);
	}
}

/**
 * Finds the placeholder [data-bar="key"] inside a post and renders a flex bar.
 * @param {HTMLElement} postEl - The .post container element.
 * @param {string} title - Section key ("Activities" or "Mood").
 * @param {Array<{label: string, hours: number}>} entries - Data entries.
 */
function injectBar(postEl, title, entries) {
	if (!entries || !entries.length) return;

	const key = title.toLowerCase();
	const placeholder = postEl.querySelector(`[data-bar="${key}"]`);
	if (!placeholder) return;

	placeholder.innerHTML = ""; // clear any fallback

	const bar = document.createElement("div");
	bar.className = "progress-bar";
	placeholder.appendChild(bar);

	entries.forEach((e) => {
		if (e.hours <= 0) return;
		const cls = e.label.toLowerCase().replace(/\s+/g, "-");
		const seg = document.createElement("div");
		seg.classList.add("segment", cls);
		seg.style.flex = e.hours;
		seg.dataset.activity = e.label;
		seg.dataset.hours = e.hours;
		bar.appendChild(seg);
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Infinite Scroll Binding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scroll event handler that triggers loading the next archive when near bottom.
 */
function onScroll() {
	if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
		loadNext();
	}
}

/**
 * Attaches the scroll listener for infinite loading.
 */
function bindScrollListener() {
	window.addEventListener("scroll", onScroll);
}

// ─────────────────────────────────────────────────────────────────────────────
// Language Switcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sets up the language switcher buttons to toggle page language.
 * Expects <button data-lang="en"> and <button data-lang="pl"> inside .lang-switch.
 */
function setupLangSwitcher() {
	const switcher = document.querySelector(".lang-switch");
	if (!switcher) return;

	const htmlEl = document.documentElement;
	let currentLang = "en";
	htmlEl.classList.add(`lang-active-${currentLang}`);

	switcher.addEventListener("click", (e) => {
		const btn = e.target.closest("button[data-lang]");
		if (!btn) return;
		const lang = btn.dataset.lang;
		if (lang === currentLang) return;

		switcher.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));

		htmlEl.classList.replace(`lang-active-${currentLang}`, `lang-active-${lang}`);
		currentLang = lang;
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Masonry Grid Layout for Images
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tag each .item in a grid as .landscape if its <img> is wider than tall.
 * @param {HTMLElement} grid – the .image-grid element to process
 */
function tagImageOrientation(grid) {
	grid.querySelectorAll(".item img").forEach((img) => {
		const applyTag = () => {
			if (img.naturalWidth > img.naturalHeight) {
				img.parentElement.classList.add("landscape");
			}
		};
		if (img.complete) {
			applyTag();
		} else {
			img.addEventListener("load", applyTag);
		}
	});
}

function initSubscribeForm() {
	const msg = document.getElementById("subscribe-message");
	if (!msg) return;

	if (window.location.hash === "#subscribed") {
		msg.textContent = "✅ Thanks for subscribing!";
		msg.style.color = "lightgreen";
	} else if (window.location.hash === "#error") {
		msg.textContent = "❌ Something went wrong. Please try again.";
		msg.style.color = "salmon";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialize on DOM Ready
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
	initSubscribeForm();
	setupLangSwitcher();
	bindScrollListener();
	initArchive();
});
