document.addEventListener("DOMContentLoaded", () => {
	const container = document.getElementById("posts");

	// start at current year/month
	let year = new Date().getFullYear();
	let month = new Date().getMonth() + 1; // 1–12

	// keep track so we don’t double-fetch
	const fetched = new Set();

	// format month to "MM"
	const pad = (n) => String(n).padStart(2, "0");

	// Attempt to fetch and append blog/YYYY/MM/index.html
	async function loadArchive(y, m) {
		const base = `${y}/${pad(m)}`;
		// 1) fetch the HTML
		const htmlRes = await fetch(`${base}/index.html`);
		if (!htmlRes.ok) return false;
		const htmlText = await htmlRes.text();

		// parse and grab the .post
		const tmp = document.createElement("div");
		tmp.innerHTML = htmlText.trim();
		const post = tmp.querySelector(".post");
		if (!post) return false;

		// 2) fetch the JSON
		const dataRes = await fetch(`${base}/data.json`);
		let data = null;
		if (dataRes.ok) {
			data = await dataRes.json();
			// inject both bars
			injectBar(post, "Activities", data.activities);
			injectBar(post, "Mood", data.mood);
		}

		container.appendChild(post);
		fetched.add(base);
		return true;
	}

	// Move to the previous month (rollover year if needed)
	function decrementMonth() {
		month--;
		if (month < 1) {
			month = 12;
			year--;
		}
	}

	// Try loading the next-oldest archive, skipping missing months
	async function loadNext() {
		decrementMonth();
		// optionally bail if you go past some limit, e.g. 2020
		while (year >= 2020) {
			const ok = await loadArchive(year, month);
			if (ok) return;
			decrementMonth();
		}
	}

	// INITIAL LOAD: try current month, if missing jump backwards
	loadArchive(year, month).then((ok) => {
		if (!ok) loadNext();
	});

	// INFINITE SCROLL: when you get within 200px of bottom, loadNext()
	window.addEventListener("scroll", () => {
		if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
			loadNext();
		}
	});
});

/**
 * Finds the placeholder [data-bar="key"], and renders a heading + flex‐bar into it.
 */
function injectBar(postEl, title, entries) {
	if (!entries || !entries.length) return;
	const placeholder = postEl.querySelector(`[data-bar="${title.toLowerCase()}"]`);
	if (!placeholder) return;

	// build the flex‐bar
	const total = entries.reduce((sum, e) => sum + e.hours, 0);
	const bar = document.createElement("div");
	bar.className = "progress-bar";
	placeholder.appendChild(bar);

	entries.forEach((e) => {
		if (e.hours <= 0) return; // skip zero‐hour entries
		const cls = e.label.toLowerCase().replace(/\s+/g, "-");
		const seg = document.createElement("div");
		seg.classList.add("segment", cls);
		seg.style.flex = e.hours; // width ∝ hours
		seg.dataset.activity = e.label;
		seg.dataset.hours = e.hours;
		bar.appendChild(seg);
	});
}
