/**
 * DeveloperController
 *
 * @description :: Server-side logic for managing Developers
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var async = require('async')
var path = require('path')
var slugify = require('slugify')
var Entities = require('html-entities').AllHtmlEntities
var htmlentities = new Entities()
var http = require('http')
var https = require('https')
var url = require('url')
var fs = require('fs')

module.exports = {

  uploadImage: function (name, req, res, next) {
    var fileToDownload = req.body.img
    var extension = fileToDownload.split('.').pop()
    // noinspection EqualityComparisonWithCoercionJS
    if (extension != 'png' && extension != 'jpg' && extension != 'jpeg')
      return res.json({
        status: false,
        msg: req.__('Vous avez tenté de configurer une image n\'ayant pas la bonne extension.'),
        inputs: {}
      })
    name += '.' + extension
    var file = fs.createWriteStream(path.join(__dirname, '../../', sails.config.developer.upload.folders.imgs, name))
    // noinspection EqualityComparisonWithCoercionJS
    var crawler = (url.parse(fileToDownload).protocol == 'https:') ? https : http
    crawler.get(fileToDownload, function(response) {
      if (response.statusCode !== 200 || response.headers['content-length'] <= 0)
        return res.json({
          status: false,
          msg: req.__('Vous avez tenté de configurer une image n\'étant pas disponible.'),
          inputs: {}
        })
      if (response.headers['content-type'] !== 'image/jpeg' && response.headers['content-type'] !== 'image/png')
        return res.json({
          status: false,
          msg: req.__('Vous avez tenté de configurer une image n\'étant pas une image.'),
          inputs: {}
        })
      response.pipe(file).on('error', function (err) {
        console.error(err)
        return res.json({
          status: false,
          msg: req.__('Une erreur est survenue lors de l\'enregistrement de l\'image.'),
          inputs: {}
        })
      }).on('close', function () {
        sails.log.info('Uploaded ' + name + ' successfuly ! (' + response.headers['content-length'] + ' bytes)')
        next()
      })
    }).on('error', function (err) {
      sails.log.error(err)
      return res.json({
        status: false,
        msg: req.__('Vous avez tenté de configurer une image n\'étant pas disponible.'),
        inputs: {}
      })
    })
  },

  addContributor: function (req, res) {
    RequestManagerService.setRequest(req).setResponse(res).valid({
      'Tous les champs ne sont pas remplis.': [
        ['user', 'Vous devez spécifier un utilisateur'],
        ['type', 'Vous devez choisir un type d\'extension'],
        ['extension', 'Vous devez choisir une extension']
      ],
      'Vous avez choisi une extension invalide': [
        {
          field: 'type',
          in: ['PLUGIN', 'THEME'],
          error: 'Type d\'extension non valide'
        }
      ]
    }, function () {
      // Find user
      User.findOne({username: req.body.user, developer: 'CONFIRMED'}).exec(function (err, user) {
        if (err) {
          sails.log.error(err)
          return res.serverError()
        }
        if (user === undefined)
          return res.json({
            status: false,
            msg: req.__('L\'utilisateur n\'a pas été trouvé. Veuillez renseigner un nom d\'utilisateur valide.'),
            inputs: {}
          })
        if (user.id === req.session.userId)
          return res.json({
            status: false,
            msg: req.__('Vous ne pouvez pas vous ajouter vous-même.'),
            inputs: {}
          })
        // Find extension
        var model = (req.body.type === 'PLUGIN') ? Plugin : Theme
        model.findOne({id: req.body.extension}).exec(function (err, extension) {
          if (err) {
            sails.log.error(err)
            return res.serverError()
          }
          if (extension === undefined)
            return res.json({
              status: false,
              msg: req.__('L\'extension n\'a pas été trouvée.'),
              inputs: {}
            })
          if (extension.author !== req.session.userId)
            return res.forbidden()
          // Check if unique
          Contributor.findOne({
            user: user.id,
            type: req.body.type,
            extension: extension.id
          }).exec(function (err, contributor) {
            if (err) {
              sails.log.error(err)
              return res.serverError()
            }
            if (contributor !== undefined)
              return res.json({
                status: false,
                msg: req.__('L\'utilisateur est déjà contributeur.'),
                inputs: {}
              })
            // Add contributor
            Contributor.create({
              user: user.id,
              type: req.body.type,
              extension: extension.id
            }).exec(function (err) {
              if (err) {
                sails.log.error(err)
                return res.serverError()
              }
              return res.json({
                status: true,
                msg: req.__('L\'utilisateur a bien été ajouté en tant que contributeur !'),
                inputs: {},
                data: {
                  user: User.addMd5Email(user)
                }
              })
            })
          })
        })
      })
    })
  },

  removeContributor: function (req, res) {
    if (req.param('id') === undefined) {
      return res.notFound('ID is missing')
    }
    var id = req.param('id')

    // Get contributor
    Contributor.findOne({id: id}).exec(function (err, contributor) {
      if (err) {
        sails.log.error(err)
        return res.serverError()
      }
      if (contributor === undefined)
        return res.notFound()
      // Get extension
      var model = (contributor.type === 'PLUGIN') ? Plugin : Theme
      model.findOne({id: contributor.extension}).exec(function (err, extension) {
        if (err) {
          sails.log.error(err)
          return res.serverError()
        }
        // Extension not found
        if (extension === undefined) {
          Contributor.destroy({id: contributor.id}).exec(function (err) {
            if (err)
              sails.log.error(err)
          })
          return res.send()
        }
        // Check permission
        if (extension.author !== req.session.userId)
          return res.forbidden()
        // Delete
        Contributor.destroy({id: contributor.id}).exec(function (err) {
          if (err) {
            sails.log.error(err)
            return res.serverError()
          }
          return res.send()
        })
      })
    })
  },

  canEdit: function (type, extension, userId, next) {
    if (extension.author === userId)
      return next(true)
    console.log('check')
    Contributor.findOne({type: type, extension: extension.id, user: userId}).exec(function (err, result) {
      if (err) {
        sails.log.error(err)
        return next(false)
      }
      console.log(result)
      if (result !== undefined)
        return next(true)
      return next(false)
    })
  },

  getPluginsThemesCmsVersionsAvailables: function (next) {
    async.parallel([

      // Find plugins
      function (callback) {
        Plugin.find({state: 'CONFIRMED'}).populate(['author']).exec(function (err, plugins) {
          if (err)
            return callback(err, undefined)

          var pluginsList = []
          async.forEach(plugins, function (plugin, next) {

            // list versions into array
            var versionsAvailable = []
            for (var i = 0; i < plugin.versions.length; i++) {
              if (plugin.versions[i].public)
                versionsAvailable.push(plugin.versions[i].version)
            }

            // push
            pluginsList.push({
              dbId: plugin.id,
              id: plugin.author.username.toLowerCase() + '.' + plugin.slug.toLowerCase() + '.' + plugin.id,
              name: plugin.name,
              versionsAvailable: versionsAvailable
            })

            next()

          }, function () {
            callback(undefined, pluginsList)
          })
        })
      },

      // Find themes
      function (callback) {
        Theme.find({state: 'CONFIRMED'}).populate(['author']).exec(function (err, themes) {
          if (err)
            return callback(err, undefined)

          var themesList = []
          async.forEach(themes, function (theme, next) {

            // list versions into array
            var versionsAvailable = []
            for (var i = 0; i < theme.versions.length; i++) {
              if (theme.versions[i].public)
                versionsAvailable.push(theme.versions[i].version)
            }

            // push
            themesList.push({
              dbId: theme.id,
              id: theme.author.username.toLowerCase() + '.' + theme.slug.toLowerCase() + '.' + theme.id,
              name: theme.name,
              versionsAvailable: versionsAvailable
            })

            next()

          }, function () {
            callback(undefined, themesList)
          })
        })
      },

      // Find CMS versions
      function (callback) {
        Version.find({state: 'RELEASE'}).exec(function (err, versions) {
          if (err)
            return callback(err)

          var versionsAvailable = []
          for (var i = 0; i < versions.length; i++) {
            versionsAvailable.push(versions[i].version)
          }

          callback(undefined, versionsAvailable)

        })
      }

    ], function (err, results) {
      if (err)
        return next(err)
      return next(undefined, results)
    })
  },

  index: function (req, res) {
    if (res.locals.user.developer === 'NONE') {
      return res.render('developer/candidate', {
        title: req.__('Devenir développeur')
      })
    }
    else if (res.locals.user.developer === 'CONFIRMED') {

      async.parallel([

        // Find plugins
        function (callback) {
          Plugin.find({author: req.session.userId, state: 'CONFIRMED'}).populate(['author']).exec(callback)
        },

        // Find themes
        function (callback) {
          Theme.find({author: req.session.userId, state: 'CONFIRMED'}).populate(['author']).exec(callback)
        },

        // Find contributed plugins
        function (callback) {
          Contributor.find({user: req.session.userId, type: 'PLUGIN'}).exec(function (err, contributors) {
            async.map(contributors, function (contributor, next) {
              Plugin.findOne({id: contributor.extension, state: 'CONFIRMED'}).populate(['author']).exec(next)
            }, callback)
          })
        },

        // Find contributed themes
        function (callback) {
          Contributor.find({user: req.session.userId, type: 'THEME'}).exec(function (err, contributors) {
            async.map(contributors, function (contributor, next) {
              Theme.findOne({id: contributor.extension, state: 'CONFIRMED'}).populate(['author']).exec(next)
            }, callback)
          })
        }

      ], function (err, results) {

        if (err) {
          sails.log.error(err)
          return res.serverError()
        }

        // Set vars
        var plugins = _.union(results[0], results[2])
        var themes = _.union(results[1], results[3])
        var totalDownloads = 0
        var purchasesTotalGain = 0

        // Handle contributors
        async.map(plugins, function (plugin, next) {
          Contributor.find({
            type: 'PLUGIN',
            extension: plugin.id
          }).populate(['user']).exec(function (err, contributors) {
            if (err)
              return next(err, plugin)
            plugin.contributors = contributors
            next(undefined, plugin)
          })
        }, function (err, plugins) {
          if (err)
            sails.log.error(err)

          async.map(themes, function (theme, next) {
            Contributor.find({
              type: 'THEME',
              extension: theme.id
            }).populate(['user']).exec(function (err, contributors) {
              if (err)
                return next(err, theme)
              theme.contributors = contributors
              next(undefined, theme)
            })
          }, function (err, themes) {
            if (err)
              sails.log.error(err)

            // Calcul downloads
            for (var i = 0; i < plugins.length; i++)
              totalDownloads += plugins[i].downloads
            for (i = 0; i < themes.length; i++)
              totalDownloads += themes[i].downloads

            async.parallel([

              // Find purchases of his plugins
              function (callback) {
                Purchase.query('SELECT plugin.name, SUM(paypalhistory.paymentAmount - paypalhistory.taxAmount) AS total FROM plugin INNER JOIN purchase ON purchase.itemId = plugin.id AND purchase.type = \'PLUGIN\' INNER JOIN paypalhistory ON paypalhistory.id = purchase.paymentId WHERE plugin.author = ' + req.session.userId + ' GROUP BY plugin.id;', function (err, results) {
                  if (err) {
                    sails.log.error(err)
                    return callback()
                  }
                  for (plugin in results)
                    purchasesTotalGain += results[plugin].total
                  callback()
                })
              },

              // Find purchases of his themes
              function (callback) {
                Purchase.query('SELECT theme.name, SUM(paypalhistory.paymentAmount - paypalhistory.taxAmount) AS total FROM theme INNER JOIN purchase ON purchase.itemId = theme.id AND purchase.type = \'THEME\' INNER JOIN paypalhistory ON paypalhistory.id = purchase.paymentId WHERE theme.author = ' + req.session.userId + ' GROUP BY theme.id;', function (err, results) {
                  if (err) {
                    sails.log.error(err)
                    return callback()
                  }
                  for (theme in results)
                    purchasesTotalGain += results[theme].total
                  callback()
                })
              },

            ], function (err) {

              if (err) {
                sails.log.error(err)
                return res.serverError()
              }

              // Render
              return res.render('developer/dashboard', {
                title: req.__('Espace développeur'),
                plugins: plugins,
                themes: themes,
                totalDownloads: totalDownloads,
                purchasesTotalGain: purchasesTotalGain
              })

            })
          })
        })
      })
    }
    else {
      return res.redirect('/user/profile')
    }
  },

  candidate: function (req, res) {
    RequestManagerService.setRequest(req).setResponse(res).valid({
      'Tous les champs ne sont pas remplis.': [
        ['content', 'Vous ne pouvez pas envoyer une candidature vide'],
      ]
    }, function () {

      // Check if isn't developer
      if (res.locals.user.developer !== 'NONE') {
        return res.json({
          status: false,
          msg: req.__('Vous avez déjà soumis une candidature ! Vous devez attendre la réponse avant de pouvoir en soumettre une nouvelle.'),
          inputs: {}
        })
      }

      req.body.content = htmlentities.encode(req.body.content)
      req.body.content = req.body.content.replace(/(?:\r\n|\r|\n)/g, '<br />')

      // Update user developer status & save candidate
      User.update({id: req.session.userId}, {
        developer: 'CANDIDATE',
        developerCandidacy: req.body.content
      }).exec(function (err, userUpdated) {

        if (err) {
          sails.log.error(err)
          return res.serverError()
        }

        return res.json({
          status: true,
          msg: req.__('Vous avez bien soumis votre candidature ! Vous devriez recevoir une réponse sous peu.'),
          inputs: {}
        })

      })

    })
  },

  editPayPalData: function (req, res) {
    // Handle request
    RequestManagerService.setRequest(req).setResponse(res).valid({
      'Tous les champs ne sont pas remplis.': [
        ['paypalDeveloperEmail', 'Vous devez spécifier un email'],
      ],
      'Vous devez choisir un email valide !': [
        {
          field: 'paypalDeveloperEmail',
          regex: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
          error: 'Cet email n\'a pas un format valide.'
        }
      ]
    }, function () {

      // If not already used
      User.count({paypalDeveloperEmail: req.body.paypalDeveloperEmail}).exec(function (err, count) {

        if (err) {
          sails.log.error(err)
          return res.serverError()
        }

        // Already used
        if (count > 0) {
          return res.json({
            status: false,
            msg: req.__('Vous devez choisir un email non utilisé !'),
            inputs: {
              email: req.__('Cet email est déjà utilisé.')
            }
          })
        }

        // Save
        User.update({id: req.session.userId}, {paypalDeveloperEmail: req.body.paypalDeveloperEmail}).exec(function (err, userUpdated) {

          if (err) {
            sails.log.error(err)
            return res.serverError()
          }

          return res.json({
            status: true,
            msg: req.__('Vous avez bien modifié votre adresse email PayPal !'),
            inputs: {}
          })

        })

      })

    })
  },

  addPluginPage: function (req, res) {
    this.getPluginsThemesCmsVersionsAvailables(function (err, results) {

      if (err) {
        sails.log.error(err)
        return res.serverError()
      }

      // render
      return res.render('developer/edit_plugin', {
        title: req.__('Ajout de plugin'),
        plugin: { // fake plugin
          name: undefined,
          slug: req.__('Remplissage automatique'),
          prix: undefined,
          version: '1.0.0',
          img: undefined,
          versions: [],
          requirements: []
        },
        pluginsList: results[0],
        themesList: results[1],
        cmsVersionsAvailables: results[2],
        add: true
      })

    })
  },

  editPluginPage: function (req, res) {
    // get id
    if (req.param('id') === undefined) {
      return res.notFound('ID is missing')
    }
    var id = req.param('id')
    var self = this

    async.parallel([

      // Find plugin
      function (callback) {
        Plugin.findOne({id: id, state: 'CONFIRMED'}).exec(function (err, plugin) {
          if (err)
            return callback(err)

          if (plugin === undefined)
            return callback(undefined, undefined)

          var requirements = []
          // Handle requirements
          for (var type in plugin.requirements) {

            // handle operator & version
            var split = plugin.requirements[type].split(' ')
            if (split.length === 2) {
              var operator = split[0]
              var version = split[1]
            }
            else {
              var operator = '='
              var version = plugin.requirements[type]
            }

            // push
            requirements.push({
              type: type,
              operator: operator,
              version: version
            })
          }
          plugin.requirements = requirements
          callback(undefined, plugin)
        })
      },

      //
      function (callback) {
        self.getPluginsThemesCmsVersionsAvailables(function (err, results) {
          callback(err, results)
        })
      }

    ], function (err, results) {

      if (err) {
        sails.log.error(err)
        return res.serverError()
      }

      if (results[0] === undefined)
        return res.notFound()

      self.canEdit('PLUGIN', results[0], req.session.userId, function (canEdit) {
        if (!canEdit)
          return res.forbidden()

        // render
        return res.render('developer/edit_plugin', {
          title: req.__('Edition de votre plugin'),
          plugin: results[0],
          pluginsList: results[1][0],
          themesList: results[1][1],
          cmsVersionsAvailables: results[1][2]
        })
      })
    })
  },

  // add or edit
  editPlugin: function (req, res) {
    var add = (req.path === '/developer/add/plugin')
    var data = JSON.parse(req.body.data)
    var self = this

    if (add) {

      RequestManagerService.setRequest(req).setBody(data).setResponse(res).valid({
        'Tous les champs ne sont pas remplis.': [
          ['name', 'Vous devez spécifier un nom'],
          ['price', 'Vous devez spécifier un prix (0 pour gratuit)'],
          ['img', 'Vous devez spécifier une URL d\'image d\'illustration'],
          ['description', 'Vous devez spécifier une description'],
          {field: 'files', file: true, error: 'Vous devez envoyer des fichiers'},
        ]
      }, savePlugin)

    }
    else { // edit
      RequestManagerService.setRequest(req).setBody(data).setResponse(res).valid({
        'Tous les champs ne sont pas remplis.': [
          ['name', 'Vous devez spécifier un nom'],
          ['price', 'Vous devez spécifier un prix (0 pour gratuit)'],
          ['img', 'Vous devez spécifier une URL d\'image d\'illustration'],
          ['description', 'Vous devez spécifier une description']
        ]
      }, function () {

        // get id
        if (req.param('id') === undefined) {
          return res.notFound('ID is missing')
        }
        var id = req.param('id')

        // If plugin exist
        Plugin.findOne({id: id, state: 'CONFIRMED'}).exec(function (err, plugin) {

          if (err) {
            sails.log.error(err)
            return res.serverError()
          }

          if (plugin === undefined)
            return res.notFound()

          self.canEdit('PLUGIN', plugin, req.session.userId, function (canEdit) {
            if (!canEdit)
              return res.forbidden()

            updatePlugin(plugin)
          })
        })
      })
    }

    function updatePlugin (plugin) {
      var name = 'PLUGIN-' + plugin.id
      self.uploadImage(name, req, res, function () {
        Plugin.update({id: plugin.id}, {
          name: data.name,
          price: data.price,
          img: data.img,
          description: data.description,
          versions: plugin.versions
        }).exec(function (err, pluginUpdated) {

          if (err) {
            sails.log.error(err)
            return res.serverError()
          }

          if (pluginUpdated[0].price > plugin.price)
            MailService.send('developer/admin_price', {
              name: plugin.name,
              type: 'PLUGIN',
              price: pluginUpdated[0].price,
              oldPrice: plugin.price
            }, req.__('Modification de prix d\'un plugin'), 'contact@eywek.fr')

          // Notification
          NotificationService.success(req, req.__('Vous avez bien modifié votre plugin !'))

          // render
          res.json({
            status: true,
            msg: req.__('Vous avez bien modifié votre plugin !'),
            inputs: {}
          })
        })
      })
    }

    function savePlugin () {
      // try to upload files
      req.file('files').upload({

        saveAs: function (file, cb) { // Check extension & content-type

          var extension = file.filename.split('.').pop()

          // seperate allowed and disallowed file types
          if ((file.headers['content-type'] !== 'application/zip' && file.headers['content-type'] !== 'application/x-zip-compressed' && file.headers['content-type'] !== 'application/octet-stream') || extension != 'zip') {
            // don't save
            return res.json({
              status: false,
              msg: req.__('Vous avez tenté d\'envoyer un fichier autre qu\'une archive zip ou n\'ayant pas la bonne extension.'),
              inputs: {}
            })
          }
          else {
            // save
            var name = req.session.userId + '-' + slugify(data.name) + '.zip'
            cb(null, path.join(__dirname, '../../', sails.config.developer.upload.folders.plugins, name))
          }

        }

      }, function whenDone (err, file) {

        if (err) {
          sails.log.error(err)
          return res.serverError()
        }

        // save in db
        Plugin.create({
          name: data.name,
          price: data.price,
          img: data.img,
          description: data.description,
          versions: '[{"version":"1.0.0","public":false,"changelog":{"fr_FR":["Mise en place du plugin"]},"releaseDate":null}]',
          author: req.session.userId,
          version: '1.0.0'
        }).exec(function (err, pluginCreated) {

          if (err) {
            sails.log.error(err)
            return res.serverError()
          }

          // Pushbullet
          PushbulletService.push('Nouveau plugin à vérifier', RouteService.getBaseUrl() + '/admin/developer/plugin/validate/' + pluginCreated.id, 'Plugin', pluginCreated.id, [sails.config.pushbullet.principalEmail])

          // Notification
          NotificationService.success(req, req.__('Vous avez bien ajouté votre plugin ! Il sera vérifié et validé sous peu.'))

          // render
          res.json({
            status: true,
            msg: req.__('Vous avez bien ajouté votre plugin ! Il sera vérifié et validé sous peu.'),
            inputs: {}
          })
        })
      })
    }
  },

  updatePluginPage: function (req, res) {
    // get id
    if (req.param('id') === undefined) {
      return res.notFound('ID is missing')
    }
    var id = req.param('id')
    var self = this

    Plugin.findOne({id: id, state: 'CONFIRMED'}).exec(function (err, plugin) {

      if (err) {
        sails.log.error(err)
        return res.serverError()
      }

      if (plugin === undefined)
        return res.notFound()

      self.canEdit('PLUGIN', plugin, req.session.userId, function (canEdit) {
        if (!canEdit || !plugin.versions[0].public)
          return res.forbidden()

        // render
        return res.render('developer/update_plugin', {
          title: req.__('Ajouter une version à votre plugin'),
          plugin: plugin
        })
      })
    })
  },

  updatePlugin: function (req, res) {
    // get id
    if (req.param('id') === undefined) {
      return res.notFound('ID is missing')
    }
    var id = req.param('id')
    var self = this

    if (req.body['versionChangelog[]'] !== undefined && typeof req.body['versionChangelog[]'] !== 'object')
      req.body['versionChangelog[]'] = [req.body['versionChangelog[]']]

    // check request
    RequestManagerService.setRequest(req).setResponse(res).valid({
      'Tous les champs ne sont pas remplis.': [
        ['versionName', 'Vous devez spécifier un nom de version'],
        ['versionChangelog[]', 'Vous devez au moins ajouter 1 changement'],
        {
          field: 'versionChangelog[]',
          arrayValueNeedFilled: '0',
          error: 'Vous devez au moins ajouter 1 changement'
        },
        {field: 'files', file: true, error: 'Vous devez envoyer des fichiers'}
      ],
      'Votre nom de version est incorrect.': [
        {
          field: 'versionName',
          regex: /^(\d+\.)(\d+\.)(\*|\d+)$/g,
          error: 'Vous devez mettre une version au format X.X.X'
        }
      ]
    }, function () {

      // find plugin
      Plugin.findOne({id: id, state: 'CONFIRMED'}).exec(function (err, plugin) {

        if (err) {
          sails.log.error(err)
          return res.serverError()
        }

        // not found
        if (plugin === undefined)
          return res.notFound()

        self.canEdit('PLUGIN', plugin, req.session.userId, function (canEdit) {
          if (!canEdit || !plugin.versions[0].public)
            return res.forbidden()

          // add version
          plugin.versions.unshift({
            version: req.body.versionName,
            public: false,
            changelog: {
              'fr_FR': req.body['versionChangelog[]']
            }
          })

          // try to upload files
          req.file('files').upload({

            saveAs: function (file, cb) { // Check extension & content-type

              var extension = file.filename.split('.').pop()

              // seperate allowed and disallowed file types
              if ((file.headers['content-type'] !== 'application/zip' && file.headers['content-type'] !== 'application/x-zip-compressed' && file.headers['content-type'] !== 'application/octet-stream') || extension != 'zip') {
                // don't save
                return res.json({
                  status: false,
                  msg: req.__('Vous avez tenté d\'envoyer un fichier autre qu\'une archive zip ou n\'ayant pas la bonne extension.'),
                  inputs: {}
                })
              }
              else {
                // save
                var name = plugin.author + '-' + plugin.slug + '-v' + req.body.versionName + '.zip'
                cb(null, path.join(__dirname, '../../', sails.config.developer.upload.folders.plugins, name))
              }

            }

          }, function whenDone (err, file) {

            if (err) {
              sails.log.error(err)
              return res.serverError()
            }

            // Save
            Plugin.update({id: id}, {versions: plugin.versions}).exec(function (err, pluginUpdated) {

              if (err) {
                sails.log.error(err)
                return res.serverError()
              }

              // Pushbullet
              PushbulletService.push('Nouvelle version de plugin à vérifier', RouteService.getBaseUrl() + '/admin/developer/plugin/update/validate/' + id, 'Plugin', id, [sails.config.pushbullet.principalEmail])

              // Notification
              NotificationService.success(req, req.__('Vous avez bien ajouté une nouvelle version à votre plugin ! Elle sera vérifiée et validée sous peu.'))

              // render
              res.json({
                status: true,
                msg: req.__('Vous avez bien ajouté une nouvelle version à votre plugin ! Elle sera vérifiée et validée sous peu.'),
                inputs: {}
              })

            })

          })
        })
      })

    })
  },

  deletePlugin: function (req, res) {
    // get id
    if (req.param('id') === undefined) {
      return res.notFound('ID is missing')
    }
    var id = req.param('id')

    Plugin.findOne({id: id, state: 'CONFIRMED'}).exec(function (err, plugin) {

      if (err) {
        sails.log.error(err)
        return res.serverError()
      }

      if (plugin === undefined)
        return res.notFound()

      if (plugin.author !== req.session.userId)
        return res.forbidden()

      Plugin.update({id: id}, {state: 'DELETED'}).exec(function (err, pluginUpdated) {

        if (err) {
          sails.log.error(err)
          return res.serverError()
        }

        // Notification
        NotificationService.success(req, req.__('Vous avez bien supprimé votre plugin !'))

        // redirect
        res.redirect('/developer')

      })

    })

  },

  addThemePage: function (req, res) {
    this.getPluginsThemesCmsVersionsAvailables(function (err, results) {

      if (err) {
        sails.log.error(err)
        return res.serverError()
      }

      // render
      return res.render('developer/edit_theme', {
        title: req.__('Ajout de thème'),
        theme: { // fake theme
          name: undefined,
          slug: req.__('Remplissage automatique'),
          prix: undefined,
          version: '1.0.0',
          img: undefined,
          versions: [],
          supported: []
        },
        pluginsList: results[0],
        cmsVersionsAvailables: results[2],
        add: true
      })

    })
  },

  editThemePage: function (req, res) {
    // get id
    if (req.param('id') === undefined) {
      return res.notFound('ID is missing')
    }
    var id = req.param('id')
    var self = this

    async.parallel([

      // Find theme
      function (callback) {
        Theme.findOne({id: id, state: 'CONFIRMED'}).exec(function (err, theme) {
          if (err)
            return callback(err)

          if (theme === undefined)
            return callback(undefined, undefined)

          var supported = []
          // Handle supported
          for (var type in theme.supported) {

            // handle operator & version
            var split = theme.supported[type].split(' ')
            if (split.length === 2) {
              var operator = split[0]
              var version = split[1]
            }
            else {
              var operator = '='
              var version = theme.supported[type]
            }

            // push
            supported.push({
              type: type,
              operator: operator,
              version: version
            })
          }
          theme.supported = supported
          callback(undefined, theme)
        })
      },

      //
      function (callback) {
        self.getPluginsThemesCmsVersionsAvailables(function (err, results) {
          callback(err, results)
        })
      }

    ], function (err, results) {

      if (err) {
        sails.log.error(err)
        return res.serverError()
      }

      if (results[0] === undefined)
        return res.notFound()

      self.canEdit('THEME', results[0], req.session.userId, function (canEdit) {
        if (!canEdit)
          return res.forbidden()

        // render
        return res.render('developer/edit_theme', {
          title: req.__('Edition de votre thème'),
          theme: results[0],
          pluginsList: results[1][0],
          cmsVersionsAvailables: results[1][2]
        })
      })
    })
  },

  // add or edit
  editTheme: function (req, res) {
    var add = (req.path === '/developer/add/theme')
    var data = JSON.parse(req.body.data)
    var self = this

    if (add) {
      RequestManagerService.setRequest(req).setBody(data).setResponse(res).valid({
        'Tous les champs ne sont pas remplis.': [
          ['name', 'Vous devez spécifier un nom'],
          ['price', 'Vous devez spécifier un prix (0 pour gratuit)'],
          ['img', 'Vous devez spécifier une URL d\'image d\'illustration'],
          ['description', 'Vous devez spécifier une description'],
          {field: 'files', file: true, error: 'Vous devez envoyer des fichiers'},
        ]
      }, saveTheme)
    }
    else { // edit
      RequestManagerService.setRequest(req).setBody(data).setResponse(res).valid({
        'Tous les champs ne sont pas remplis.': [
          ['name', 'Vous devez spécifier un nom'],
          ['price', 'Vous devez spécifier un prix (0 pour gratuit)'],
          ['img', 'Vous devez spécifier une URL d\'image d\'illustration'],
          ['description', 'Vous devez spécifier une description']
        ]
      }, function () {

        // get id
        if (req.param('id') === undefined) {
          return res.notFound('ID is missing')
        }
        var id = req.param('id')

        // If theme exist
        Theme.findOne({id: id, state: 'CONFIRMED'}).exec(function (err, theme) {

          if (err) {
            sails.log.error(err)
            return res.serverError()
          }

          if (theme === undefined)
            return res.notFound()

          // if not author
          self.canEdit('THEME', theme, req.session.userId, function (canEdit) {
            if (!canEdit)
              return res.forbidden()

            updateTheme(theme)
          })
        })
      })
    }

    function updateTheme (theme) {
      var name = 'THEME-' + theme.id
      self.uploadImage(name, req, res, function () {
        Theme.update({id: theme.id}, {
          name: data.name,
          price: data.price,
          img: data.img,
          description: data.description,
          versions: theme.versions
        }).exec(function (err, themeUpdated) {

          if (err) {
            sails.log.error(err)
            return res.serverError()
          }

          if (themeUpdated[0].price > theme.price)
            MailService.send('developer/admin_price', {
              name: theme.name,
              type: 'THEME',
              price: themeUpdated[0].price,
              oldPrice: theme.price
            }, req.__('Modification de prix d\'un thème'), 'contact@eywek.fr')

          // Notification
          NotificationService.success(req, req.__('Vous avez bien modifié votre thème !'))

          // render
          res.json({
            status: true,
            msg: req.__('Vous avez bien modifié votre thème !'),
            inputs: {}
          })
        })
      })
    }

    function saveTheme () {
      // try to upload files
      req.file('files').upload({

        saveAs: function (file, cb) { // Check extension & content-type

          var extension = file.filename.split('.').pop()

          // seperate allowed and disallowed file types
          if ((file.headers['content-type'] !== 'application/zip' && file.headers['content-type'] !== 'application/x-zip-compressed' && file.headers['content-type'] !== 'application/octet-stream') || extension != 'zip') {
            // don't save
            return res.json({
              status: false,
              msg: req.__('Vous avez tenté d\'envoyer un fichier autre qu\'une archive zip ou n\'ayant pas la bonne extension.'),
              inputs: {}
            })
          }
          else {
            // save
            var name = req.session.userId + '-' + slugify(req.body.name) + '.zip'
            cb(null, path.join(__dirname, '../../', sails.config.developer.upload.folders.themes, name))
          }

        }

      }, function whenDone (err, file) {

        if (err) {
          sails.log.error(err)
          return res.serverError()
        }

        // save in db
        Theme.create({
          name: data.name,
          price: data.price,
          img: data.img,
          description: data.description,
          versions: '[{"version":"1.0.0","public":false,"changelog":{"fr_FR":["Mise en place du thème"]},"releaseDate":null}]',
          author: req.session.userId,
          version: '1.0.0'
        }).exec(function (err, themeCreated) {

          if (err) {
            sails.log.error(err)
            return res.serverError()
          }

          // Pushbullet
          PushbulletService.push('Nouveau thème à vérifier', RouteService.getBaseUrl() + '/admin/developer/theme/validate/' + themeCreated.id, 'Theme', themeCreated.id, [sails.config.pushbullet.principalEmail])

          // Notification
          NotificationService.success(req, req.__('Vous avez bien ajouté votre thème ! Il sera vérifié et validé sous peu.'))

          // render
          res.json({
            status: true,
            msg: req.__('Vous avez bien ajouté votre thème ! Il sera vérifié et validé sous peu.'),
            inputs: {}
          })
        })
      })
    }
  },

  updateThemePage: function (req, res) {
    // get id
    if (req.param('id') === undefined) {
      return res.notFound('ID is missing')
    }
    var id = req.param('id')
    var self = this

    Theme.findOne({id: id, state: 'CONFIRMED'}).exec(function (err, theme) {

      if (err) {
        sails.log.error(err)
        return res.serverError()
      }

      if (theme === undefined)
        return res.notFound()

      self.canEdit('THEME', theme, req.session.userId, function (canEdit) {
        if (!canEdit || !theme.versions[0].public)
          return res.forbidden()

        // render
        return res.render('developer/update_theme', {
          title: req.__('Ajouter une version à votre thème'),
          theme: theme
        })
      })
    })
  },

  updateTheme: function (req, res) {
    // get id
    if (req.param('id') === undefined) {
      return res.notFound('ID is missing')
    }
    var id = req.param('id')
    var self = this

    if (req.body['versionChangelog[]'] !== undefined && typeof req.body['versionChangelog[]'] !== 'object')
      req.body['versionChangelog[]'] = [req.body['versionChangelog[]']]

    // check request
    RequestManagerService.setRequest(req).setResponse(res).valid({
      'Tous les champs ne sont pas remplis.': [
        ['versionName', 'Vous devez spécifier un nom de version'],
        ['versionChangelog[]', 'Vous devez au moins ajouter 1 changement'],
        {
          field: 'versionChangelog[]',
          arrayValueNeedFilled: '0',
          error: 'Vous devez au moins ajouter 1 changement'
        },
        {field: 'files', file: true, error: 'Vous devez envoyer des fichiers'}
      ],
      'Votre nom de version est incorrect.': [
        {
          field: 'versionName',
          regex: /^(\d+\.)(\d+\.)(\*|\d+)$/g,
          error: 'Vous devez mettre une version au format X.X.X'
        }
      ]
    }, function () {

      // find plugin
      Theme.findOne({id: id, state: 'CONFIRMED'}).exec(function (err, theme) {

        if (err) {
          sails.log.error(err)
          return res.serverError()
        }

        // not found
        if (theme === undefined)
          return res.notFound()

        self.canEdit('THEME', theme, req.session.userId, function (canEdit) {
          if (!canEdit || !theme.versions[0].public)
            return res.forbidden()

          // add version
          theme.versions.unshift({
            version: req.body.versionName,
            public: false,
            changelog: {
              'fr_FR': req.body['versionChangelog[]']
            }
          })

          // try to upload files
          req.file('files').upload({

            saveAs: function (file, cb) { // Check extension & content-type

              var extension = file.filename.split('.').pop()

              // seperate allowed and disallowed file types
              if ((file.headers['content-type'] !== 'application/zip' && file.headers['content-type'] !== 'application/x-zip-compressed' && file.headers['content-type'] !== 'application/octet-stream') || extension != 'zip') {
                // don't save
                return res.json({
                  status: false,
                  msg: req.__('Vous avez tenté d\'envoyer un fichier autre qu\'une archive zip ou n\'ayant pas la bonne extension.'),
                  inputs: {}
                })
              }
              else {
                // save
                var name = theme.author + '-' + theme.slug + '-v' + req.body.versionName + '.zip'
                cb(null, path.join(__dirname, '../../', sails.config.developer.upload.folders.themes, name))
              }

            }

          }, function whenDone (err) {
            if (err) {
              sails.log.error(err)
              return res.serverError()
            }

            // Save
            Theme.update({id: id}, {versions: theme.versions}).exec(function (err) {

              if (err) {
                sails.log.error(err)
                return res.serverError()
              }

              // Pushbullet
              PushbulletService.push('Nouvelle version de thème à vérifier', RouteService.getBaseUrl() + '/admin/developer/theme/update/validate/' + id, 'Theme', id, [sails.config.pushbullet.principalEmail])

              // Notification
              NotificationService.success(req, req.__('Vous avez bien ajouté une nouvelle version à votre thème ! Elle sera vérifiée et validée sous peu.'))

              // render
              res.json({
                status: true,
                msg: req.__('Vous avez bien ajouté une nouvelle version à votre thème ! Elle sera vérifiée et validée sous peu.'),
                inputs: {}
              })

            })
          })
        })
      })
    })
  },

  deleteTheme: function (req, res) {
    // get id
    if (req.param('id') === undefined) {
      return res.notFound('ID is missing')
    }
    var id = req.param('id')

    Theme.findOne({id: id, state: 'CONFIRMED'}).exec(function (err, theme) {

      if (err) {
        sails.log.error(err)
        return res.serverError()
      }

      if (theme === undefined)
        return res.notFound()

      if (theme.author !== req.session.userId)
        return res.forbidden()

      Theme.update({id: id}, {state: 'DELETED'}).exec(function (err, themeUpdated) {

        if (err) {
          sails.log.error(err)
          return res.serverError()
        }

        // Notification
        NotificationService.success(req, req.__('Vous avez bien supprimé votre thème !'))

        // redirect
        res.redirect('/developer')

      })

    })
  },

  submitCustomExtensionPage: function (req, res) {
    CustomExtension.find({author: req.session.userId}).exec(function (err, extensions) {
      if (err) {
        console.error(err)
        return res.serverError()
      }

      res.view('developer/submit_custom_extension', {
        title: req.__('Soumettre une extension personnalisée'),
        extensions: extensions
      })
    })
  },

  submitCustomExtension: function (req, res) {
    RequestManagerService.setRequest(req).setResponse(res).valid({
      'Tous les champs ne sont pas remplis.': [
        ['slug', 'Vous devez spécifier un nom de version'],
        {field: 'files', file: true, error: 'Vous devez envoyer des fichiers'}
      ],
      'Vous n\'avez pas respecté certaines règles': [
        {
          field: 'slug',
          max: 50,
          error: 'Votre slug doit faire au maximum 50 caractères'
        },
        {
          field: 'type',
          in: ['PLUGIN', 'THEME'],
          error: 'Le type sélectionné est inconnu'
        }
      ]
    }, function () {
      // Check if not already uploaded
      CustomExtension.findOne({
        author: req.session.userId,
        type: req.body.type,
        slug: req.body.slug,
        state: 'PENDING'
      }).exec(function (err, extension) {
        if (err) {
          console.error(err)
          return res.status(500).send()
        }
        if (extension !== undefined && extension.id !== undefined)
          return res.json({status: false, msg: req.__('L\'extension est déjà soumise, veuillez patienter.')})

        // Try to upload
        req.file('files').upload({
          saveAs: function (file, cb) { // Check extension & content-type

            var extension = file.filename.split('.').pop()

            // seperate allowed and disallowed file types
            if ((file.headers['content-type'] !== 'application/zip' && file.headers['content-type'] !== 'application/x-zip-compressed' && file.headers['content-type'] !== 'application/octet-stream') || extension != 'zip') {
              // don't save
              return res.json({
                status: false,
                msg: req.__('Vous avez tenté d\'envoyer un fichier autre qu\'une archive zip ou n\'ayant pas la bonne extension.'),
                inputs: {}
              })
            }
            else {
              // save
              var name = req.body.type + '_' + req.session.userId + '-' + slugify(req.body.slug) + '.zip'
              cb(null, path.join(__dirname, '../../', sails.config.developer.upload.folders.custom, name))
            }
          }
        }, function whenDone (err, file) {
          if (err) {
            console.error(err)
            return res.status(500).send()
          }

          CustomExtension.create({
            type: req.body.type,
            state: 'PENDING',
            slug: req.body.slug,
            author: req.session.userId
          }).exec(function (err, extension) {
            if (err) {
              console.error(err)
              return res.status(500).send()
            }

            return res.json({
              status: true,
              msg: req.__('L\'extension a bien été soumise, vous recevrez un email quand celle-ci sera validée.'),
              inputs: {},
              data: {
                extension: extension
              }
            })
          })
        })
      })
    })
  },

  downloadCustomSecure: function (req, res) {
    if (req.param('id') === undefined) {
      return res.notFound('ID is missing')
    }
    var id = req.param('id')

    CustomExtension.findOne({id: id, author: req.session.userId, state: 'SUCCESS'}).exec(function (err, extension) {
      if (err) {
        console.error(err)
        return res.serverError()
      }
      if (extension === undefined || extension.id === undefined)
        return res.notFound()

      res.set('Content-Type', 'text/plain')
      res.set('Content-Length', JSON.stringify(extension.secure).length)
      res.set('Content-Disposition', 'attachment; filename=secure')
      res.send(JSON.stringify(extension.secure))
    })
  }
}
