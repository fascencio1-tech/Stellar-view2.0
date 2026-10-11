// Configura window.ORBIT_API_BASE en index.html con la URL pública de Railway
// (incluye /api si el backend publica sus rutas debajo de ese prefijo).
const ORBIT_API = String(window.ORBIT_API_BASE || 'http://localhost:3002/api').replace(/\/+$/, '');
// Esta clave se usa desde el navegador y será visible para los visitantes.
// Para ocultarla en producción, mueve esta petición a un endpoint de tu servidor.
const NASA_API_KEY = window.NASA_APOD_API_KEY || 'k8fPV5pqws2GW9PPEWcPqDuP55GfaVd0vTbX3gMK';
const NASA_APOD_API = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic/';

let articlesData = [];
let expandedArticleId = null;
let articlesLoaded = false;
let apodExpanded = false;

async function loadApod() {
  const loadingEl = document.getElementById('nasa-loading');
  const errorEl = document.getElementById('nasa-error');
  const contentEl = document.getElementById('nasa-content');
  if (!loadingEl || !contentEl) return;

  loadingEl.classList.remove('hidden');
  errorEl?.classList.add('hidden');
  contentEl.classList.add('hidden');

  try {
    const url = new URL(NASA_APOD_API);
    url.searchParams.set('api_key', NASA_API_KEY);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`NASA respondió HTTP ${response.status}`);

    const payload = await response.json();
    const apod = normalizeApod(payload);
    if (!apod) {
      const fields = payload && typeof payload === 'object' ? Object.keys(payload).join(', ') : typeof payload;
      throw new Error(`La respuesta de NASA no contiene título y explicación. Campos recibidos: ${fields || 'ninguno'}`);
    }
    renderApod(apod);
    contentEl.classList.remove('hidden');
  } catch (error) {
    console.error('No se pudo cargar la imagen astronómica del día:', error);
    if (errorEl) {
      errorEl.textContent = 'No pudimos conectar con NASA en este momento. Intenta recargar la página dentro de unos minutos.';
      errorEl.classList.remove('hidden');
    }
  } finally {
    loadingEl.classList.add('hidden');
  }
}

function normalizeApod(payload) {
  // La API puede responder con el registro directo, una colección o un wrapper.
  let item = Array.isArray(payload) ? payload[0] : payload;
  if (!item || typeof item !== 'object') return null;
  item = item.data || item.apod || item.result || item;
  if (Array.isArray(item)) item = item[0];
  if (!item || typeof item !== 'object') return null;

  const title = typeof item.title === 'string' ? item.title : item.title?.rendered;
  const rawExplanation = item.explanation || item.content?.rendered || item.description;
  const explanation = typeof rawExplanation === 'string' ? htmlToText(rawExplanation) : '';
  if (!title || !explanation) return null;

  return {
    ...item,
    title,
    explanation,
    date: item.date || item.date_gmt || item.published_at,
    media_type: item.media_type || item.type,
    url: item.hdurl || item.image_url || item.url
  };
}

function htmlToText(value) {
  const documentFragment = new DOMParser().parseFromString(value, 'text/html');
  return documentFragment.body.textContent.trim();
}

function renderApod(apod) {
  const media = document.getElementById('apod-media');
  const title = document.getElementById('apod-title');
  const text = document.getElementById('apod-text');
  const date = document.getElementById('apod-date');
  const readMore = document.getElementById('apod-read-more');
  if (!media || !title || !text || !date || !readMore) return;

  title.textContent = apod.title;
  text.textContent = apod.explanation;
  text.classList.remove('is-expanded');
  apodExpanded = false;
  const copyright = typeof apod.copyright === 'string' ? htmlToText(apod.copyright) : '';
  date.textContent = [formatApodDate(apod.date), copyright ? `© ${copyright}` : 'NASA · APOD']
    .filter(Boolean)
    .join(' · ');
  readMore.classList.toggle('hidden', apod.explanation.length <= 320);
  readMore.innerHTML = 'Leer explicación completa <span aria-hidden="true">↓</span>';

  media.replaceChildren();
  const imageUrl = apod.hdurl || (apod.media_type === 'image' ? apod.url : '');
  if (imageUrl) {
    const image = document.createElement('img');
    image.className = 'apod-image';
    image.src = imageUrl;
    image.alt = apod.alt || apod.title;
    image.loading = 'eager';
    image.referrerPolicy = 'no-referrer';
    media.appendChild(image);
  } else if (apod.media_type === 'video' && apod.url) {
    const videoLink = document.createElement('a');
    videoLink.className = 'apod-video-link';
    videoLink.href = apod.url;
    videoLink.target = '_blank';
    videoLink.rel = 'noopener noreferrer';
    videoLink.textContent = 'Ver el video de hoy en NASA ↗';
    media.appendChild(videoLink);
  }
}

function formatApodDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

document.getElementById('apod-read-more')?.addEventListener('click', () => {
  const text = document.getElementById('apod-text');
  const button = document.getElementById('apod-read-more');
  if (!text || !button) return;
  apodExpanded = !apodExpanded;
  text.classList.toggle('is-expanded', apodExpanded);
  button.innerHTML = apodExpanded
    ? 'Mostrar menos <span aria-hidden="true">↑</span>'
    : 'Leer explicación completa <span aria-hidden="true">↓</span>';
});

loadApod();

// Los botones del HTML usan onclick="navigate(...)".
window.navigate = function navigate(screenId) {
  const target = document.getElementById(screenId);
  if (!target || !target.classList.contains('screen')) return;

  document.querySelectorAll('.screen').forEach(screen => {
    const isActive = screen === target;
    screen.classList.toggle('active', isActive);
    screen.classList.toggle('hidden', !isActive);
  });

  document.querySelectorAll('.nav-button').forEach(button => {
    const isCurrent = button.getAttribute('onclick')?.includes(`'${screenId}'`);
    button.classList.toggle('is-current', Boolean(isCurrent));
    if (isCurrent) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  if (screenId === 'articles' && !articlesLoaded) loadArticles();
};

async function fetchPublications() {
  const response = await fetch(`${ORBIT_API}/publications`);
  if (!response.ok) throw new Error(`Orbit respondió HTTP ${response.status}`);

  const result = await response.json();
  if (!Array.isArray(result.data)) throw new Error('La respuesta de Orbit no contiene una lista de publicaciones');
  return result.data;
}

async function loadArticles() {
  const loadingEl = document.getElementById('articles-loading');
  const container = document.getElementById('articles-container');
  if (!container) return;

  articlesLoaded = false;
  if (loadingEl) {
    loadingEl.textContent = 'Conectando con Orbit…';
    loadingEl.classList.remove('hidden');
  }
  container.replaceChildren();

  try {
    articlesData = await fetchPublications();
    articlesLoaded = true;
    renderArticles();
  } catch (error) {
    console.error('Error al cargar artículos desde Orbit:', error);
    if (loadingEl) loadingEl.classList.add('hidden');
    const message = document.createElement('p');
    message.className = 'card-text';
    message.textContent = `No se pudieron cargar las publicaciones desde ${ORBIT_API}. Verifica la URL del backend en index.html, que Railway tenga el servicio activo y que permita solicitudes CORS desde este sitio.`;
    container.replaceChildren(message);
  }
}

function renderArticles() {
  const container = document.getElementById('articles-container');
  const loadingEl = document.getElementById('articles-loading');
  if (loadingEl) loadingEl.classList.add('hidden');
  if (!container) return;

  container.replaceChildren();
  if (articlesData.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'card-text';
    emptyMessage.textContent = 'No hay artículos disponibles en Orbit.';
    container.appendChild(emptyMessage);
    return;
  }

  articlesData.forEach(article => {
    const card = document.createElement('article');
    card.className = 'card';

    if (article.image_url) {
      const image = document.createElement('img');
      image.src = article.image_url;
      image.alt = article.title || 'Imagen del artículo';
      image.className = 'apod-image';
      image.loading = 'lazy';
      card.appendChild(image);
    }

    const title = document.createElement('h2');
    title.className = 'apod-title';
    title.textContent = article.title || 'Sin título';
    const separator = document.createElement('div');
    separator.className = 'separator';
    const text = document.createElement('p');
    text.className = 'card-text';

    const fullContent = article.content || article.summary || '';
    const isExpanded = expandedArticleId === article.id;
    text.textContent = !isExpanded && fullContent.length > 180
      ? `${fullContent.slice(0, 180)}…`
      : fullContent;
    card.append(title, separator, text);

    if (fullContent.length > 180) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'read-more-btn';
      button.textContent = isExpanded ? 'Ver menos ▲' : 'Leer más ▼';
      button.addEventListener('click', () => window.toggleArticle(article.id));
      card.appendChild(button);
    }

    const details = [article.category, article.author, article.created_at].filter(Boolean).join(' · ');
    if (details) {
      const footer = document.createElement('p');
      footer.className = 'date-text';
      footer.textContent = details;
      card.appendChild(footer);
    }

    container.appendChild(card);
  });
}

window.toggleArticle = function toggleArticle(id) {
  expandedArticleId = expandedArticleId === id ? null : id;
  renderArticles();
};
