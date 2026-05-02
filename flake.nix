{
  description = "gemini2obsidian dev environment + task surface (Node toolchain + system deps)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-25.11-darwin";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      pkgsFor = system: nixpkgs.legacyPackages.${system};

      # Wrap an npm script as a writeShellApplication. The wrapper:
      #   - asserts ./node_modules exists (fails with an instructive error if not)
      #   - prepends node_modules/.bin to PATH
      #   - execs the script body with all positional args forwarded as "$@"
      # Tool binaries come from npm-managed node_modules; Nix supplies the
      # Node runtime and the invocation surface. See ADR-011.
      mkAppDrv =
        pkgs: name: script:
        pkgs.writeShellApplication {
          inherit name;
          runtimeInputs = [
            pkgs.nodejs_24
            pkgs.zip
          ];
          text = ''
            if [ ! -d "$PWD/node_modules" ]; then
              echo "error: node_modules/ not found in $PWD" >&2
              echo "run 'npm ci' first to install dependencies" >&2
              exit 1
            fi
            export PATH="$PWD/node_modules/.bin:$PATH"
            ${script}
          '';
        };

      mkApps =
        pkgs:
        let
          app = name: script: {
            type = "app";
            program = "${mkAppDrv pkgs name script}/bin/${name}";
          };
        in
        {
          dev = app "dev" ''vite "$@"'';
          build = app "build" ''
            tsc --noEmit
            vite build "$@"
          '';
          build-zip = app "build-zip" ''
            tsc --noEmit
            vite build
            version=$(node -p "require('./package.json').version")
            ( cd dist && zip -r "../gemini2obsidian-$version.zip" . -x '*.DS_Store' -x '.vite/*' )
          '';
          lint = app "lint" ''
            eslint src/
            node scripts/lint-platforms.mjs
          '';
          lint-platforms = app "lint-platforms" ''node scripts/lint-platforms.mjs "$@"'';
          format = app "format" ''prettier --write "src/**/*.{ts,tsx,css,html}" "$@"'';
          format-check = app "format-check" ''prettier --check "src/**/*.{ts,tsx,css,html}" "$@"'';
          test = app "test" ''vitest run "$@"'';
          test-watch = app "test-watch" ''vitest "$@"'';
          test-coverage = app "test-coverage" ''vitest run --coverage "$@"'';
          e2e-auth = app "e2e-auth" ''npx tsx e2e/auth/setup-profile.ts "$@"'';
          e2e-selectors = app "e2e-selectors" ''npx playwright test --config e2e/playwright.config.ts "$@"'';
          e2e-selectors-headed = app "e2e-selectors-headed" ''npx playwright test --config e2e/playwright.config.ts --headed "$@"'';
          e2e-daemon = app "e2e-daemon" ''npx tsx e2e/daemon/daemon.ts "$@"'';
        };
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShellNoCC {
            packages = [
              pkgs.nodejs_24
              pkgs.zip
            ];
            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PATH"
            '';
          };
        }
      );

      apps = forAllSystems (system: mkApps (pkgsFor system));
    };
}
