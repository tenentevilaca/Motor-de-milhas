// Busca de hospedagem (Trivago) — combobox de destino + formulário + grade
// de resultados. Usa api()/escapeHtml() de app.js (carregado antes deste).

function formatPrice(value, currency) {
  if (value == null) return '-';
  try {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: currency || 'USD' });
  } catch {
    return `${currency || ''} ${value}`.trim();
  }
}

function setupDestinationCombobox() {
  const queryInput = document.getElementById('destinationQuery');
  const list = document.getElementById('destinationList');
  if (!queryInput || !list) return;
  let debounceTimer = null;

  function closeList() {
    list.classList.remove('open');
    list.innerHTML = '';
  }

  function renderSuggestions(suggestions) {
    if (suggestions.length === 0) {
      list.innerHTML = '<div class="combobox-empty">Nenhum destino encontrado</div>';
      list.classList.add('open');
      return;
    }
    list.innerHTML = suggestions
      .map(
        (s, i) =>
          `<div class="combobox-option" data-index="${i}"><span class="iata">🏨</span><span class="place">${escapeHtml(s.name)}${
            s.locationLabel ? ` — ${escapeHtml(s.locationLabel)}` : ''
          }${s.accommodationCount ? ` · ${s.accommodationCount} opções` : ''}</span></div>`
      )
      .join('');
    list.classList.add('open');
    Array.from(list.querySelectorAll('.combobox-option')).forEach((el) => {
      el.addEventListener('click', () => {
        queryInput.value = suggestions[Number(el.dataset.index)].name;
        closeList();
      });
    });
  }

  queryInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = queryInput.value.trim();
    if (q.length < 2) return closeList();
    debounceTimer = setTimeout(async () => {
      try {
        const { suggestions } = await api(`/api/hotels/destinations?q=${encodeURIComponent(q)}`);
        renderSuggestions(suggestions || []);
      } catch {
        closeList();
      }
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (!list.contains(e.target) && e.target !== queryInput) closeList();
  });
}

function hotelCardHtml(h) {
  const stars = h.stars ? '⭐'.repeat(Math.round(h.stars)) : '';
  const distance = h.distanceKm != null ? `<div class="hotel-distance">📍 ${h.distanceKm.toFixed(1)} km do local buscado</div>` : '';
  return `
    <a class="hotel-card" href="${escapeHtml(h.url || '#')}" target="_blank" rel="noopener">
      ${h.imageUrl ? `<img class="hotel-img" src="${escapeHtml(h.imageUrl)}" alt="" loading="lazy" />` : '<div class="hotel-img hotel-img--empty"></div>'}
      <div class="hotel-card-body">
        <div class="hotel-name">${escapeHtml(h.name)}</div>
        <div class="hotel-location">${escapeHtml(h.locationLabel || '')} ${stars}</div>
        <div class="hotel-rating">${h.ratingScore != null ? `⭐ ${h.ratingScore} (${h.ratingLabel || ''}, ${h.reviewsCount ?? 0} avaliações)` : 'Sem avaliação'}</div>
        ${distance}
        <div class="hotel-price">${h.priceFrom != null ? `a partir de ${formatPrice(h.priceFrom, h.currency)}` : 'Preço indisponível'}</div>
      </div>
    </a>`;
}

async function searchHotelsNow() {
  const status = document.getElementById('hotelSearchStatus');
  const resultBlock = document.getElementById('hotelResultBlock');
  const result = document.getElementById('hotelResult');
  const destination = document.getElementById('destinationQuery').value.trim();
  const nearPlace = document.getElementById('nearPlace').value.trim();
  const checkIn = document.getElementById('checkIn').value;
  const checkOut = document.getElementById('checkOut').value;
  const adults = Number(document.getElementById('adults').value) || 2;
  const rooms = Number(document.getElementById('rooms').value) || 1;
  const sortBy = document.querySelector('input[name="sortBy"]:checked').value;

  if (!destination || !checkIn || !checkOut) {
    status.textContent = 'Preencha destino, check-in e check-out.';
    status.style.color = 'var(--danger-text)';
    return;
  }
  if (sortBy === 'distance' && !nearPlace) {
    status.textContent = 'Pra ordenar por proximidade, preencha o "local específico".';
    status.style.color = 'var(--danger-text)';
    return;
  }

  status.textContent = 'Buscando hotéis...';
  status.style.color = 'var(--muted)';
  resultBlock.hidden = true;

  try {
    const data = await api('/api/hotels/search', {
      method: 'POST',
      body: JSON.stringify({ destination, nearPlace, checkIn, checkOut, adults, rooms, sortBy }),
    });

    if (data.status === 'not_configured') {
      status.textContent = data.message;
      status.style.color = 'var(--danger-text)';
      return;
    }
    if (data.status === 'error') {
      status.textContent = data.message;
      status.style.color = 'var(--danger-text)';
      return;
    }
    if (data.hotels.length === 0) {
      status.textContent = data.message || 'Nenhum hotel encontrado.';
      status.style.color = 'var(--muted)';
      return;
    }

    status.textContent = `${data.total} hotéis encontrados em ${data.destination.name}${
      data.targetPlaceName ? ` — distância calculada a partir de ${data.targetPlaceName}` : ''
    }.`;
    status.style.color = '#16a34a';
    result.innerHTML = `<div class="grid-cards">${data.hotels.map(hotelCardHtml).join('')}</div>`;
    resultBlock.hidden = false;
  } catch (err) {
    status.textContent = 'Erro: ' + err.message;
    status.style.color = 'var(--danger-text)';
  }
}

setupDestinationCombobox();
