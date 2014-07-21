"use strict";

var mysql = require('mysql'),
    Q = require('q');

var pool, loggers = [];

function log(msg) {
    loggers.forEach(function(l) {
        l("MyOath: " + msg);
    });
}

exports.addLogger = function (f) {
    loggers.push(f);
};

exports.removeLogger = function(f) {
    var newList = [];
    loggers.forEach(function (l) {
        if (f !== l) {
            newList.push(l);
        }
    });
    loggers = newList;
}

exports.init = function (config) {
    pool = mysql.createPool(config);
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
 * @returns {defer.promise|*|promise|Q.promise}
 */
exports.exec = function (sql, parameters) {
    var result = Q.defer();
    log("Exec: " + sql);
    pool.query(sql, parameters, function (err, rows, fields) {
        if (err) {
            log("Error: " + err.toString());
            result.reject(new Error(err));
        } else {
            log("Success");
            result.resolve({
                rows: rows,
                fields: fields
            });
        }
    });
    return result.promise;
};

exports.getStream = function (sql, parameters) {
    var result = Q.defer();
    var fields;
    log("getStream: " + sql);
    var query = pool.query(sql, parameters);
    query.on('error', function (error) {
        log("Error: " + error.toString());
        result.reject(error);
    });
    query.on('fields', function (fieldData) {
        log("getStream Fields");
        fields = fieldData;
    });
    query.on('result', function (row) {
        log("getStream row");
        result.notify(row);
    });
    query.on('end', function () {
        log("getStream end");
        result.resolve(fields);
    });
    return result.promise;
};

exports.getOneRow = function(sql, parameters) {
    var result = Q.defer();
    exports.exec(sql, parameters)
        .then(function (r) {
            result.resolve(r.rows.length ? r.rows[0] : false);
        })
        .catch(function (e) {
            result.reject(e);
        })
        .done();
    return result.promise;
};

exports.getOneValue = function (sql, parameters) {
    var result = Q.defer();
    exports.exec(sql, parameters)
        .then(function (r) {
            var key;
            if (r.rows.length < 1) {
                r.reject(new Error("Requested one value but not no rows"));
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

exports.add = function (table, data) {
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
    return exports.exec(sql, parameters);
};

exports.set = function (table, identity, data) {
    var sql,
        columnName,
        parameters = [],
        where = [],
        sets = [];
    for (columnName in data) {
        if (!data.hasOwnProperty(columnName)) {
            continue;
        }
        sets.push("`" + columnName + "` = ?");
        parameters.push(data[columnName]);
    }
    for (columnName in identity) {
        if (!identity.hasOwnProperty(columnName)) {
            continue;
        }
        where.push("`" + columnName + "` = ?");
        parameters.push(identity[columnName]);
    }
    sql = "update `" + table + "` set " +
        sets.join(", ") +
        " where (" +
        where.join(") and (") +
        ")";
    return exports.exec(sql, parameters);
};

exports.delete = function (table, identity) {
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
    return exports.getOneRow(sql, parameters);
};

exports.get = function (table, identity) {
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
    return exports.getOneRow(sql, parameters);
};