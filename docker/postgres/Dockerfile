# ============================================================================
# PanditConnect Postgres — PostGIS + pgvector
# ============================================================================
# 01-schema.sql needs PostGIS for the geospatial temple/pandit indexes, and
# migration 12 needs pgvector for AI knowledge retrieval. No published image
# ships both:
#
#   postgis/postgis:16-3.4        PostGIS, no pgvector
#   pgvector/pgvector:pg16        pgvector, no PostGIS
#
# So we layer pgvector onto the PostGIS image. The Debian (bookworm) variant is
# used rather than -alpine deliberately: the PGDG apt repository is already
# configured in it, so pgvector arrives as a signed prebuilt package instead of
# a from-source build that would need a compiler toolchain in the final image.
#
# This changes the base image, so `docker compose build db` is required. It does
# NOT require wiping the volume — see the note at the bottom.
# ============================================================================

FROM postgis/postgis:16-3.4

# postgresql-16-pgvector comes from PGDG, which the postgis image already
# trusts. Pinned to the Postgres major so an apt upgrade cannot silently pull a
# build compiled against a different server ABI.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-pgvector \
 && rm -rf /var/lib/apt/lists/*

# Fail the build rather than the migration if the extension did not land.
# `CREATE EXTENSION vector` inside migration 12 would otherwise be the first
# place anyone finds out, several minutes into a deploy.
RUN test -f "$(pg_config --sharedir)/extension/vector.control" \
 || (echo "pgvector did not install — vector.control missing" && exit 1)

# ----------------------------------------------------------------------------
# Existing databases
# ----------------------------------------------------------------------------
# docker-entrypoint-initdb.d only runs against an EMPTY data directory, so an
# existing volume keeps its data and simply gains the ability to run
# `CREATE EXTENSION vector` — which migration 12 does. Rebuild and restart:
#
#     docker compose build db && docker compose up -d db
#     cd backend && npm run db:migrate
#
# Do NOT use `docker compose down -v`; that deletes the volume and every temple,
# pandit and upload in it.
# ----------------------------------------------------------------------------
