const rawBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '');

export const buildApiUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

export const apiFetch = (path, options) => fetch(buildApiUrl(path), options);

export const getErrorMessage = async (response, fallback = 'Request failed') => {
  let detail = fallback;
  try {
    const data = await response.json();
    detail =
      (typeof data?.error === 'string' && data.error) ||
      data?.error?.message ||
      data?.message ||
      fallback;
  } catch (err) {
    // response body wasn't JSON — keep fallback
  }
  return `${detail} (HTTP ${response.status})`;
};
