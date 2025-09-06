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

		// Add click handlers to existing images for fullscreen functionality
		addClickHandlersToExistingImages(post);

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
// Image Processing Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds click handlers to existing hardcoded images
 * @param {HTMLElement} postEl - The .post element containing images
 */
function addClickHandlersToExistingImages(postEl) {
	const imageGrids = postEl.querySelectorAll('.image-grid');
	
	imageGrids.forEach(grid => {
		// Handle both .item img and direct > img children
		const existingImages = grid.querySelectorAll('img');
		
		// Set data-count for dynamic styling
		grid.setAttribute('data-count', existingImages.length);
		
		// Normalize structure: wrap direct img children in .item divs
		const directImages = grid.querySelectorAll(':scope > img');
		directImages.forEach(img => {
			const item = document.createElement('div');
			item.className = 'item';
			img.parentNode.insertBefore(item, img);
			item.appendChild(img);
		});
		
		// Process all images for functionality
		existingImages.forEach(img => {
			// Skip if already has a click handler
			if (img.hasAttribute('data-fullscreen-enabled')) return;
			
			img.setAttribute('data-fullscreen-enabled', 'true');
			img.style.cursor = 'pointer';
			
			// Add hover effect classes if not already present
			const item = img.parentElement;
			if (item && item.classList.contains('item')) {
				item.style.transition = 'transform 0.2s ease, filter 0.2s ease';
			}
			
			img.addEventListener('click', () => {
				const allImages = Array.from(document.querySelectorAll('.image-grid img'));
				const clickedIndex = allImages.indexOf(img);
				openFullscreen(clickedIndex);
			});
		});
		
		// Apply aspect ratio-based sorting and height matching within this grid
		if (existingImages.length > 1) {
			sortExistingImagesByAspectRatio(grid, existingImages);
		}
	});
}

/**
 * Sorts existing images within a grid by aspect ratio and implements height matching
 * @param {HTMLElement} grid - The image grid container
 * @param {NodeList} images - The existing images in the grid
 */
function sortExistingImagesByAspectRatio(grid, images) {
	// Wait for images to load before sorting
	const imageLoadPromises = Array.from(images).map(img => {
		if (img.complete) {
			return Promise.resolve(img);
		}
		return new Promise(resolve => {
			img.addEventListener('load', () => resolve(img));
			img.addEventListener('error', () => resolve(img)); // resolve even on error
		});
	});
	
	Promise.all(imageLoadPromises).then(() => {
		// Convert to array and get aspect ratios
		const imageData = Array.from(images).map(img => {
			const item = img.parentElement;
			const aspectRatio = img.naturalWidth && img.naturalHeight ? 
				img.naturalWidth / img.naturalHeight : 1;
			const isLandscape = aspectRatio > 1.3; // More strict landscape definition
			
			return {
				element: item,
				aspectRatio,
				isLandscape,
				img
			};
		});
		
		// Enhanced sorting for better mixed layouts
		imageData.sort((a, b) => {
			// If both are landscape or both are portrait, sort by aspect ratio
			if (a.isLandscape === b.isLandscape) {
				return b.aspectRatio - a.aspectRatio; // higher aspect ratio first
			}
			// Mixed layouts: for small grids, don't separate too much
			if (imageData.length <= 4) {
				return b.aspectRatio - a.aspectRatio;
			} else {
				// For larger grids, landscape first
				return b.isLandscape - a.isLandscape;
			}
		});
		
		// Apply landscape class appropriately
		imageData.forEach(data => {
			if (data.isLandscape) {
				data.element.classList.add('landscape');
			} else {
				data.element.classList.remove('landscape');
			}
		});
		
		// Reorder the DOM elements
		imageData.forEach(data => {
			grid.appendChild(data.element);
		});
		
		// Implement height matching for mixed aspect ratio rows
		implementHeightMatching(grid, imageData);
	});
}

/**
 * Implements height matching for images in the same row with different aspect ratios
 * @param {HTMLElement} grid - The image grid container
 * @param {Array} imageData - Array of image data objects
 */
function implementHeightMatching(grid, imageData) {
	// Group images into rows based on their flex wrapping behavior
	let currentRowY = null;
	let currentRow = [];
	const rows = [];
	
	imageData.forEach(data => {
		const rect = data.element.getBoundingClientRect();
		
		if (currentRowY === null || Math.abs(rect.top - currentRowY) > 10) {
			// New row detected
			if (currentRow.length > 0) {
				rows.push([...currentRow]);
			}
			currentRow = [data];
			currentRowY = rect.top;
		} else {
			// Same row
			currentRow.push(data);
		}
	});
	
	// Add the last row
	if (currentRow.length > 0) {
		rows.push(currentRow);
	}
	
	// Apply height matching to rows with mixed aspect ratios
	rows.forEach(row => {
		if (row.length <= 1) return;
		
		// Check if row has mixed aspect ratios
		const hasLandscape = row.some(data => data.isLandscape);
		const hasPortrait = row.some(data => !data.isLandscape);
		
		if (hasLandscape && hasPortrait) {
			// Mixed aspect ratio row - apply height matching
			grid.classList.add('mixed-row');
			
			// Calculate target height based on the smallest image's natural height
			// scaled to fit within the container width
			const targetHeight = Math.min(...row.map(data => {
				const containerWidth = data.element.offsetWidth;
				const naturalRatio = data.aspectRatio;
				return containerWidth / naturalRatio;
			}));
			
			// Apply consistent height to all items in this row
			row.forEach(data => {
				data.element.style.height = `${Math.min(targetHeight, window.innerHeight * 0.25)}px`;
				data.img.style.height = '100%';
				data.img.style.objectFit = 'cover';
				data.img.style.objectPosition = 'center';
			});
		}
	});
}

/**
 * Processes image grids by populating them with images from data.json
 * and arranging them by aspect ratio within each individual grid.
 * @param {HTMLElement} postEl - The .post element containing image grids
 * @param {Array} images - Array of image objects from data.json
 * @param {string} base - The folder path for the images
 */
function processImageGrids(postEl, images, base) {
	const imageGrids = postEl.querySelectorAll(".image-grid");
	
	if (imageGrids.length === 0) return;
	
	// Calculate aspect ratios for all images
	const imagesWithAspectRatio = images.map((img, originalIndex) => ({
		...img,
		aspectRatio: img.width / img.height,
		isLandscape: (img.width / img.height) > 1.3, // More strict landscape definition
		originalIndex
	}));
	
	// Only process grids that are empty (no existing images)
	const emptyGrids = Array.from(imageGrids).filter(grid => 
		grid.querySelectorAll('img').length === 0
	);
	
	if (emptyGrids.length === 0) return;
	
	// Distribute images across empty grids
	const imagesPerGrid = Math.ceil(imagesWithAspectRatio.length / emptyGrids.length);
	
	emptyGrids.forEach((grid, gridIndex) => {
		const startIndex = gridIndex * imagesPerGrid;
		const endIndex = Math.min(startIndex + imagesPerGrid, imagesWithAspectRatio.length);
		
		// Get images for this specific grid
		const gridImages = imagesWithAspectRatio.slice(startIndex, endIndex);
		
		// Set data-count for dynamic styling
		grid.setAttribute('data-count', gridImages.length);
		
		// Sort images within this grid by aspect ratio with improved logic
		gridImages.sort((a, b) => {
			// If both are landscape or both are portrait, sort by aspect ratio
			if (a.isLandscape === b.isLandscape) {
				return b.aspectRatio - a.aspectRatio; // higher aspect ratio first
			}
			// Mixed layouts: for small grids, don't separate too much
			if (gridImages.length <= 4) {
				return b.aspectRatio - a.aspectRatio;
			} else {
				// For larger grids, landscape first
				return b.isLandscape - a.isLandscape;
			}
		});
		
		// Add images to this grid
		gridImages.forEach(imageData => {
			const item = createImageItem(imageData, base);
			grid.appendChild(item);
		});
	});
}

/**
 * Creates an image item element for the grid
 * @param {Object} imageData - Image data from data.json
 * @param {string} base - The folder path for the images
 * @returns {HTMLElement} The image item element
 */
function createImageItem(imageData, base) {
	const item = document.createElement('div');
	item.className = `item ${imageData.isLandscape ? 'landscape' : ''}`;
	
	const img = document.createElement('img');
	img.src = imageData.url || `${base}/${imageData.name}`;
	img.alt = imageData.alt || imageData.name;
	img.loading = 'lazy';
	
	// Add click handler for fullscreen
	img.addEventListener('click', () => {
		const allImages = Array.from(document.querySelectorAll('.image-grid img'));
		const clickedIndex = allImages.indexOf(img);
		openFullscreen(clickedIndex);
	});
	
	item.appendChild(img);
	return item;
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
		
		// Process images if they exist
		if (data.images && data.images.length > 0) {
			processImageGrids(postEl, data.images, base);
		}
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
// Fullscreen Image Viewer
// ─────────────────────────────────────────────────────────────────────────────

let fullscreenState = {
	isOpen: false,
	currentIndex: 0,
	images: []
};

/**
 * Opens an image in fullscreen mode
 * @param {number} index - Index of the image to display
 */
function openFullscreen(index) {
	// Collect all images from all posts for navigation
	const allImages = Array.from(document.querySelectorAll('.image-grid img'));
	fullscreenState.images = allImages;
	fullscreenState.currentIndex = index;
	fullscreenState.isOpen = true;
	
	createFullscreenModal();
	showImageAtIndex(fullscreenState.currentIndex);
	
	// Add keyboard listener when opening
	document.addEventListener('keydown', handleKeyDown);
}

/**
 * Creates the fullscreen modal if it doesn't exist
 */
function createFullscreenModal() {
	if (document.getElementById('fullscreen-modal')) return;
	
	const modal = document.createElement('div');
	modal.id = 'fullscreen-modal';
	modal.className = 'fullscreen-modal';
	
	modal.innerHTML = `
		<button class="fullscreen-close" onclick="closeFullscreen()">&times;</button>
		<button class="fullscreen-nav prev" onclick="previousImage()">❮</button>
		<button class="fullscreen-nav next" onclick="nextImage()">❯</button>
		<img id="fullscreen-image" src="" alt="">
	`;
	
	document.body.appendChild(modal);
	
	// Close on background click
	modal.addEventListener('click', (e) => {
		if (e.target === modal) {
			closeFullscreen();
		}
	});
}

/**
 * Shows the image at the specified index
 * @param {number} index - Index of the image to show
 */
function showImageAtIndex(index) {
	const modal = document.getElementById('fullscreen-modal');
	const img = document.getElementById('fullscreen-image');
	const prevBtn = modal.querySelector('.prev');
	const nextBtn = modal.querySelector('.next');
	
	if (index >= 0 && index < fullscreenState.images.length) {
		const targetImg = fullscreenState.images[index];
		img.src = targetImg.src;
		img.alt = targetImg.alt;
		
		// Update button states
		prevBtn.disabled = index === 0;
		nextBtn.disabled = index === fullscreenState.images.length - 1;
		
		// Show modal
		modal.classList.add('active');
	}
}

/**
 * Closes the fullscreen modal
 */
function closeFullscreen() {
	const modal = document.getElementById('fullscreen-modal');
	if (modal) {
		modal.classList.remove('active');
		fullscreenState.isOpen = false;
		// Remove keyboard listener to prevent memory leaks
		document.removeEventListener('keydown', handleKeyDown);
	}
}

/**
 * Shows the previous image
 */
function previousImage() {
	if (fullscreenState.currentIndex > 0) {
		fullscreenState.currentIndex--;
		showImageAtIndex(fullscreenState.currentIndex);
	}
}

/**
 * Shows the next image
 */
function nextImage() {
	if (fullscreenState.currentIndex < fullscreenState.images.length - 1) {
		fullscreenState.currentIndex++;
		showImageAtIndex(fullscreenState.currentIndex);
	}
}

/**
 * Handles keyboard navigation in fullscreen mode
 * @param {KeyboardEvent} e - The keyboard event
 */
function handleKeyDown(e) {
	if (!fullscreenState.isOpen) return;
	
	switch (e.key) {
		case 'Escape':
			closeFullscreen();
			break;
		case 'ArrowLeft':
			previousImage();
			break;
		case 'ArrowRight':
			nextImage();
			break;
	}
}

// Make functions global for onclick handlers
window.closeFullscreen = closeFullscreen;
window.previousImage = previousImage;
window.nextImage = nextImage;

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
