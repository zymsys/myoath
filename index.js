"use strict";

var mysql = require('mysql'),
    defaultMyOath;

exports.MyOath = function(options) {
    this.promises = options.promises || require('q');
    this.pool = mysql.createPool(options);
    this.loggers = [];
};

exports.MyOath.prototype.defer = function() {
    var d = this.promises.defer ? this.promises.defer() : this.promises.deferred(),
        prototype = Object.getPrototypeOf(d.promise);
    //Polyfill from https://www.promisejs.org/polyfills/promise-done-1.0.0.js
    if (!prototype.done) {
        prototype.done = function (cb, eb) {
            this.then(cb, eb).then(null, function (err) {
                setTimeout(function () {
                    throw err;
                }, 0);
            });
        };
    }
    return d;
};

exports.MyOath.prototype.log = function(msg) {
    this.loggers.forEach(function (l) {
        l("MyOath: " + msg);
    });
};

exports.MyOath.prototype.addLogger = function (f) {
    this.loggers.push(f);
};

exports.MyOath.prototype.removeLogger = function (f) {
    var newList = [];
    this.loggers.forEach(function (l) {
        if (f !== l) {
            newList.push(l);
        }
    });
    this.loggers = newList;
};

/**
 * Run a query and return a promise. Resolves to a POJO with keys for rows and fields.
 * See https://github.com/felixge/node-mysql#escaping-query-values for more about how
 * to pass parameters.
 *
 * For example:
 *   db.exec('SELECT * FROM users WHERE id = ?', [userId]
 *     .then(function (result) {
     *       // ...
     *     });
 *
 * @param sql
 * @param [parameters]
 * @returns {defer.promise|*|promise|promises.promise}
 */
exports.MyOath.prototype.exec = function (sql, parameters) {
    var self = this,
        result = this.defer();
    this.log("Exec: " + sql + "; " + JSON.stringify(parameters));
    this.pool.query(sql, parameters, function (err, rows, fields) {
        if (err) {
            self.log("Error: " + err.toString());
            result.reject(new Error(err));
        } else {
            self.log("Success");
            result.resolve({
                rows: rows,
                fields: fields
            });
        }
    });
    return result.promise;
};

exports.MyOath.prototype.getStream = function (sql, parameters) {
    var self = this,
        result = this.defer(),
        fields;
    self.log("getStream: " + sql);
    if (!result.notify) {
        result.reject(new Error(
            "Can't getStream with promises libraries that don't support progress notification."
        ));
        return result.promise;
    }
    var query = self.pool.query(sql, parameters);
    query.on('error', function (error) {
        self.log("Error: " + error.toString());
        result.reject(error);
    });
    query.on('fields', function (fieldData) {
        self.log("getStream Fields");
        fields = fieldData;
    });
    query.on('result', function (row) {
        self.log("getStream row");
        result.notify(row);
    });
    query.on('end', function () {
        self.log("getStream end");
        result.resolve(fields);
    });
    return result.promise;
};

exports.MyOath.prototype.getOneRow = function (sql, parameters) {
    var result = this.defer();
    this.exec(sql, parameters)
        .then(function (r) {
            result.resolve(r.rows.length ? r.rows[0] : false);
        })
        .catch(function (e) {
            result.reject(e);
        })
        .done();
    return result.promise;
};

exports.MyOath.prototype.getOneValue = function (sql, parameters) {
    var result = this.defer();
    this.exec(sql, parameters)
        .then(function (r) {
            var key;
            if (r.rows.length < 1) {
                result.reject(new Error("Requested one value but not no rows"));
                return;
            }
            key = r.fields[0];
            result.resolve(r.rows[0][key.name]);
        })
        .catch(function (e) {
            result.reject(e);
        })
        .done();
    return result.promise;
};

exports.MyOath.prototype.add = function (table, data) {
    var sql,
        columnName,
        parameters = [],
        values = [],
        columns = [];
    for (columnName in data) {
        if (!data.hasOwnProperty(columnName)) {
            continue;
        }
        columns.push("`" + columnName + "`");
        values.push("?");
        parameters.push(data[columnName]);
    }
    sql = "INSERT INTO `" + table + "` (" +
        columns.join(", ") +
        ") VALUES (" +
        values.join(", ") +
        ")";
    return this.exec(sql, parameters);
};

exports.MyOath.prototype.set = function (table, identity, data) {
    var sql,
        columnName,
        parameters = [],
        where = [],
        sets = [],
        columns = [],
        values = [];
    //For insert
    for (columnName in data) {
        if (!data.hasOwnProperty(columnName)) {
            continue;
        }
        parameters.push(data[columnName]);
        columns.push("`" + columnName + "`");
        values.push('?');
    }
    for (columnName in identity) {
        if (!identity.hasOwnProperty(columnName)) {
            continue;
        }
        parameters.push(identity[columnName]);
        columns.push("`" + columnName + "`");
        values.push('?');
    }
    //For update
    for (columnName in data) {
        if (!data.hasOwnProperty(columnName)) {
            continue;
        }
        sets.push("`" + columnName + "` = ?");
        parameters.push(data[columnName]);
    }
    sql = "insert into `" + table + "` (" +
        columns.join(', ') +
        ") values (" +
        values.join(', ') +
        ") on duplicate key update " +
        sets.join(", ");
    return this.exec(sql, parameters);
};

exports.MyOath.prototype.delete = function (table, identity) {
    var sql,
        columnName,
        parameters = [],
        where = [];
    for (columnName in identity) {
        if (!identity.hasOwnProperty(columnName)) {
            continue;
        }
        where.push("`" + columnName + "` = ?");
        parameters.push(identity[columnName]);
    }
    sql = "DELETE FROM `" + table + "` WHERE (" +
        where.join(") AND (") +
        ")";
    return this.getOneRow(sql, parameters);
};

exports.MyOath.prototype.get = function (table, identity) {
    var sql,
        columnName,
        parameters = [],
        where = [];
    //todo: Make identity building more DRY
    for (columnName in identity) {
        if (!identity.hasOwnProperty(columnName)) {
            continue;
        }
        where.push("`" + columnName + "` = ?");
        parameters.push(identity[columnName]);
    }
    sql = "SELECT * FROM `" + table + "` WHERE (" +
        where.join(") AND (") +
        ") LIMIT 1";
    return this.getOneRow(sql, parameters);
};

exports.MyOath.prototype.end = function () {
    var result = this.defer();
    this.pool.end(function (err) {
        if (err) {
            result.reject();
            end;
        }
        result.resolve();
    });
    return result.promise;
};

