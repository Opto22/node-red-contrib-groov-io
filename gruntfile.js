module.exports = function(grunt) {
  grunt.initConfig({
    ts: {
      client: {
        files: [{
          src: [
            "src/**/*.ts",
            "node_modules/@opto22/node-red-utils/typings/*.d.ts"],
          dest: "build/src"
        }],
        options: {
          module: "commonjs",
          target: "es6",
          sourceMap: false,
          noImplicitAny: false,
          suppressImplicitAnyIndexErrors: true,
          fast: 'never'
        }
      },
      test: {
        files: [{
          src: [
            "test/**/*.ts",
            "node_modules/@opto22/node-red-utils/typings/*.d.ts"],
          dest: "build/test"
        }],
        options: {
          module: "commonjs",
          target: "es6",
          sourceMap: false,
          noImplicitAny: false,
          suppressImplicitAnyIndexErrors: true,
          fast: 'never'
        }
      }
    },
    clean: {
      build: ['build'],
      coverage: ['coverage'],
      package: ['package', '*node-red-contrib-*.tgz']
    },
    simplemocha: {
      options: {
      },
      default: { src: ['build/test/test/**/*.js'] },
      xunit: {
        options: {
          reporter: 'xunit',
          reporterOptions: {
            output: 'xunit-results.xml'
          }
        },
        src: ['build/test/test/**/*.js']
      }
    },
    mocha_istanbul: {
      default: {
        src: ['build/test/test/**/*.js'],
        options: {
           excludes: ['**/swagger/lib/api.js'],
           reportFormats: ['cobertura','lcov'],
           root: 'build/test/',
           grep: grunt.option('grep')
        }
      }
    },
    copy: {
      testSettings: {
        nonull: true,
        src: 'test/settings.json',
        dest:'build/test/test/settings.json'
      },
      build: {
        files: [
          {src: 'src/*.html',      dest: 'build/src/',       flatten: true, expand:  true},
          {src: 'src/icons/*.png', dest: 'build/src/icons/', flatten: true, expand:  true},
         ]
      },
      package: {
        files: [
          {src: 'package.json',           dest: 'package/'},
          {src: 'build/src/*.html',       dest: 'package/'},
          {src: 'build/src/**/*.js',      dest: 'package/'},
          {src: 'build/src/icons/*.png',  dest: 'package/build/src/icons/', flatten: true, expand:  true},
          {src: 'README.md',              dest: 'package/'},
          {src: 'LICENSE',                dest: 'package/'}
         ]
      }
    },
    'npm-command': {
      pack: {
        options: {
          cmd:  'pack',
          args: './package'
        }
      }
    },
    watch: {
      src: {
        files: ["src/**/*.ts"],
        tasks: ["ts:client"],
        options: { interval: 100 }
      },
      static: {
        files: ["src/*.html", "src/*.png"],
        tasks: ["copy:build"],
        options: { interval: 100 }
      }
    },
    shell: {
      options: {
        stderr: false
      },
      /* Use Swagger Codegen to generate a client library using the Supergent request library.
      // We provide our own template file.
      // We commit the resulting code, so this only needs to be run when updating the library.
      //
      // Codegen 2.4.2 seems to be the last version in Maven.org. Or it moved and hasn't been
      // found again.
      */
      'swagger-codegen-manage-public-lib':
        'java -jar tools/swagger-codegen-cli-2.4.2.jar generate -i src/swagger/spec/manage-api-public.yaml -l typescript-node -o src/swagger/lib  -t src/swagger/codegen/api.typescript-request.mustache',
      'wget-swagger-codegen':
        'wget -O tools/swagger-codegen-cli-2.4.2.jar http://repo1.maven.org/maven2/io/swagger/swagger-codegen-cli/2.4.2/swagger-codegen-cli-2.4.2.jar'
    },
  });

  grunt.loadNpmTasks("grunt-contrib-watch");
  grunt.loadNpmTasks("grunt-contrib-clean");
  grunt.loadNpmTasks("grunt-contrib-copy");
  grunt.loadNpmTasks("grunt-npm-command");
  grunt.loadNpmTasks("grunt-ts");
  grunt.loadNpmTasks('grunt-shell');  
  grunt.loadNpmTasks("grunt-simple-mocha");
  grunt.loadNpmTasks('grunt-mocha-istanbul')

  grunt.registerTask("default", ["clean:build", "copy:build", "ts:client"]);

  /* Standard test task. Uses "src/test/external/settings.json". */
  grunt.registerTask("test", 'comment', ['default', 'ts:test', 'copy:testSettings', 'mocha_istanbul:default']);
  grunt.registerTask("mocha", 'comment', ['copy:testSettings', 'mocha_istanbul:default']);

  grunt.registerTask("swagger-api", ["shell:wget-swagger-codegen","shell:swagger-codegen-manage-public-lib"]);

  grunt.registerTask("package", 'comment', ['clean:package', 'default', 'copy:package', 'npm-command:pack']);
};
