# Lambda container image for the scraper.
#
# A container rather than a zip, and not by preference: the handler drives Playwright against a
# Chromium build, and with node_modules included that is far past the 250 MB unzipped limit. The
# chromium binary in particular arrives from @sparticuz/chromium as a brotli-compressed archive
# that is decompressed into /tmp at cold start, which is the only place on Lambda you can write.
#
# Build and push with infra/deploy-lambda.sh rather than by hand; that script also creates the
# function the first time and wires the SQS trigger.

FROM public.ecr.aws/lambda/nodejs:22

# Chromium needs a handful of shared libraries that the Lambda base image does not ship. On Amazon
# Linux 2023 the usual symptom of missing ones is a launch failure reading
# "Failed to launch the browser process", with the actual missing .so named in the Lambda log.
#
# Left off by default because the set is version-dependent and the image is large; turn it on and
# rebuild if Chromium will not start:
#   docker buildx build --build-arg INSTALL_CHROMIUM_DEPS=true ...
ARG INSTALL_CHROMIUM_DEPS=false
RUN if [ "$INSTALL_CHROMIUM_DEPS" = "true" ]; then \
      dnf install -y \
        libatk at-spi2-atk libdrm libgbm libxkbcommon libXcomposite libXdamage \
        libXfixes libXrandr mesa-libgbm nss alsa-lib pango cups-libs \
        freetype fontconfig \
      && dnf clean all ; \
    fi

# Dependencies first, so a code-only change does not reinstall node_modules on every build.
#
# `npm install` rather than `npm ci`: the committed lockfile predates the move back to AWS and
# still lists pg and full playwright. Regenerate it with a local `npm install` when convenient.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# The handler and the summarizer it imports. Deliberately explicit rather than `COPY . .` so the
# local-only files (.env, output.json, prompts.json from an earlier era) never enter the image.
COPY article_grabber.js summarizer.js ./

# Lambda calls this function; it is the module-qualified name of the handler export.
CMD [ "article_grabber.handler" ]
