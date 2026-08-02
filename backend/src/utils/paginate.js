/** Reads ?page & ?perPage from a query object, clamped to sane bounds. */
function readPaging(query, defaultPerPage = 12, maxPerPage = 48) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const perPage = Math.min(maxPerPage, Math.max(1, parseInt(query.perPage, 10) || defaultPerPage));
  return { page, perPage };
}

/** Builds the { data, meta } envelope once the repository has already applied
 *  LIMIT/OFFSET in SQL and returned the matching page plus a total count. */
function paginationEnvelope(data, { page, perPage }, total) {
  return { data, meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } };
}

module.exports = { readPaging, paginationEnvelope };
