var async  = require('async')
var moment = require('moment')
var exec = require('ssh-exec')

module.exports = {

  create: function (hosting, next) {
    var id = (sails.config.environment === 'production') ? hosting.id : ('dev-' + hosting.id)
    var host = (sails.config.environment === 'production') ? hosting.host : ('dev-' + hosting.host)
    exec('/home/mineweb.sh creation ' + id + ' ' + host + ' sdomain', {
      user: sails.config.servers.hosting.user,
      host: sails.config.servers.hosting.host,
      port: sails.config.servers.hosting.port,
      password: sails.config.servers.hosting.password
    }, function (err, stdout, stderr) {

      if (err) {
        sails.log.error(err)
        return next()
      }

      var out = stdout.split("\n")
      try {
        var ids = JSON.parse(out[6])
      } catch (e) {
        sails.log.error(e)
      }

      if (ids && ids.state === 'success') {
        ids = ids.ftp
        //Save
        Hosting.update({id: hosting.id}, {ftpUser: ids.user, ftpPassword: ids.password}).exec(function (err, hosting) {
          if (err)
            sails.log.error(err)
          return next()
        })
      }

    })
  },

  disable: function (hosting, next) {
    var id = (sails.config.environment === 'production') ? hosting.id : ('dev-' + hosting.id)

    if (next === undefined)
      var next = function () {}

    exec('/home/mineweb.sh suspension ' + id, {
      user: sails.config.servers.hosting.user,
      host: sails.config.servers.hosting.host,
      port: sails.config.servers.hosting.port,
      password: sails.config.servers.hosting.password
    }, function (err, stdout, stderr) {

      if (err) {
        sails.log.error(err)
        return next()
      }

      next()

    })
  },

  enable: function (hosting, next) {
    var id = (sails.config.environment === 'production') ? hosting.id : ('dev-' + hosting.id)

    if (next === undefined)
      var next = function () {}

    exec('/home/mineweb.sh activation ' + id, {
      user: sails.config.servers.hosting.user,
      host: sails.config.servers.hosting.host,
      port: sails.config.servers.hosting.port,
      password: sails.config.servers.hosting.password
    }, function (err, stdout, stderr) {

      if (err) {
        sails.log.error(err)
        return next()
      }

      next()

    })
  },

  delete: function (hosting, next) {
    var id = (sails.config.environment === 'production') ? hosting.id : ('dev-' + hosting.id)

    if (next === undefined)
      var next = function () {}

    exec('/home/mineweb.sh suppression ' + id, {
      user: sails.config.servers.hosting.user,
      host: sails.config.servers.hosting.host,
      port: sails.config.servers.hosting.port,
      password: sails.config.servers.hosting.password
    }, function (err, stdout, stderr) {

      if (err) {
        sails.log.error(err)
        return next()
      }

      next()

    })
  },

  checkEnded: function () { // Called all days at 12h

    console.log('Check hostings')

    async.parallel([

      /*
        Hosting ended today
      */
      function (callback) {
        // Find hosting with endDate <= now || endDate <= now + 12h && state == 1
        Hosting.find({
          endDate: {'<=': moment().hours(23).minutes(59).seconds(59).format('YYYY-MM-DD HH:mm:ss')},
          state: true
        }).populate(['user']).exec(function (err, hostings) {

          if (err)
            sails.log.error(err)

          if (hostings !== undefined && hostings.length > 0) {
            var hostingsDisabled = 0
            async.forEach(hostings, function (hosting, next) {

              // Disabled hosting (server)
              // Set state == 0 (db)
              HostingService.disable(hosting)
              Hosting.update({id: hosting.id}, {state: false}).exec(function (err, hostingUpdated) {
                if (err)
                  sails.log.error(err)

                // Send mail
                sails.config.i18n = hosting.user.lang.split('-')[0]
                MailService.send('hostings/disable', {
                  host: (hosting.hostType === 'SUBDOMAIN') ? 'http://' + hosting.host + '.craftwb.fr' : 'http://' + hosting.host,
                  url: RouteService.getBaseUrl() + '/hosting/renew/' + hosting.id,
                  username: hosting.user.username
                }, sails.__('Désactivation de votre hébergement'), hosting.user.email)

                // Save stats
                hostingsDisabled++
                next()

              })

            }, function () {
              callback(null, hostingsDisabled)
            })
          }
          else {
            callback(null, 0)
          }

        })
      },

      /*
        Hosting ended in 7 days
      */
      function (callback) {

        // Find hosting
          Hosting.find({
            or: [
              {
                endDate: {'>=': moment().add(7, 'days').hours(0).minutes(0).seconds(0).format('YYYY-MM-DD HH:mm:ss'), '<=': moment().add(7, 'days').hours(23).minutes(59).seconds(59).format('YYYY-MM-DD HH:mm:ss')}
              },
              {
                endDate: {'>=': moment().add(6, 'days').hours(0).minutes(0).seconds(0).format('YYYY-MM-DD HH:mm:ss'), '<=': moment().add(6, 'days').hours(23).minutes(59).seconds(59).format('YYYY-MM-DD HH:mm:ss')}
              },
              {
                endDate: {'>=': moment().add(5, 'days').hours(0).minutes(0).seconds(0).format('YYYY-MM-DD HH:mm:ss'), '<=': moment().add(5, 'days').hours(23).minutes(59).seconds(59).format('YYYY-MM-DD HH:mm:ss')}
              },
              {
                endDate: {'>=': moment().add(4, 'days').hours(0).minutes(0).seconds(0).format('YYYY-MM-DD HH:mm:ss'), '<=': moment().add(4, 'days').hours(23).minutes(59).seconds(59).format('YYYY-MM-DD HH:mm:ss')}
              },
              {
                endDate: {'>=': moment().add(3, 'days').hours(0).minutes(0).seconds(0).format('YYYY-MM-DD HH:mm:ss'), '<=': moment().add(3, 'days').hours(23).minutes(59).seconds(59).format('YYYY-MM-DD HH:mm:ss')}
              },
              {
                endDate: {'>=': moment().add(2, 'days').hours(0).minutes(0).seconds(0).format('YYYY-MM-DD HH:mm:ss'), '<=': moment().add(2, 'days').hours(23).minutes(59).seconds(59).format('YYYY-MM-DD HH:mm:ss')}
              },
              {
                endDate: {'>=': moment().add(1, 'days').hours(0).minutes(0).seconds(0).format('YYYY-MM-DD HH:mm:ss'), '<=': moment().add(1, 'days').hours(23).minutes(59).seconds(59).format('YYYY-MM-DD HH:mm:ss')}
              }
            ],
            state: true
          }).populate(['user']).exec(function (err, hostings) {

            if (err)
              sails.log.error(err)

            if (hostings !== undefined && hostings.length > 0) {
              var hostingsLastDays = 0
              async.forEach(hostings, function (hosting, next) {

                // Send mail
                sails.config.i18n = hosting.user.lang.split('-')[0]
                MailService.send('hostings/lastDays', {
                  host: (hosting.hostType === 'SUBDOMAIN') ? 'http://' + hosting.host + '.craftwb.fr' : 'http://' + hosting.host,
                  url: RouteService.getBaseUrl() + '/hosting/renew/' + hosting.id,
                  days: Math.floor(Math.abs( (new Date(hosting.endDate) - Date.now()) / (24 * 60 * 60 * 1000) )),
                  username: hosting.user.username
                }, sails.__('Expiration de votre hébergement'), hosting.user.email)

                // Save stats
                hostingsLastDays++
                next()

              }, function () {
                callback(null, hostingsLastDays)
              })
            }
            else {
              callback(null, 0)
            }

          })

      },

      /*
        Delete site after 7 days of state == 0
      */
      function (callback) {

        // Find hosting with endDate <= now - 7 days && state == 0
        Hosting.find({
          endDate: {'<=': moment().subtract(7, 'days').hours(0).minutes(0).seconds(0).format('YYYY-MM-DD HH:mm:ss')},
          state: false
        }).populate(['user']).exec(function (err, hostings) {

          if (err)
            sails.log.error(err)

          if (hostings !== undefined && hostings.length > 0) {
            var hostingsDeleted = 0
            async.forEach(hostings, function (hosting, next) {

              // Delete hosting (server && db)
              HostingService.delete(hosting)
              Hosting.destroy({id: hosting.id}).exec(function (err, hostingDestroyed) {
                if (err)
                  sails.log.error(err)

                // Save stats
                hostingsDeleted++
                next()

              })

            }, function () {
              callback(null, hostingsDeleted)
            })
          }
          else {
            callback(null, 0)
          }

        })
      }

    ], function (err, results) {

      // Group stats
      var stats = {
        hostingsDisabled: results[0],
        hostingsLastDays: results[1],
        hostingsDeleted: results[2]
      }

      // Send stats mail
      MailService.send('stats/hostings', {
        stats: stats
      }, sails.__('Statistiques des hébergements'), sails.config.stats.email)

      console.log('Hostings checked!', stats)

    })

  }

}
