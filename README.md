# MyOath - MySQL Promises for Node

This simple library wraps node's 
[MySQL functions](https://github.com/felixge/node-mysql) in 
[Q promises](https://github.com/kriskowal/q) and adds a 
little convenience. If you need something that isn't here, feel free to send a
pull request.

I built this because I wanted a little more than the basics but not a full
blown ORM.

## Using it

    var DB = require('myoath'),
        db = DB.MyOath({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'db'
        });
    db.exec("SELECT * FROM t")
        .then(function (results) {
            //Results.rows contains all the query results.
            //Results.fields contains the column information.
            console.log("Got %d rows", results.rows.length);
        });
        
### init(options)

The options are passed to 
[mysql.createPool](https://github.com/felixge/node-mysql#pooling-connections)
directly. Other methods will fail until this is called.

An extra option ```promises``` is available to inject the promise library you 
want to use. The object provided should offer a defer() or deferred() method
which returns a deferred with at least resolve() and reject() methods. If you
want to stream query results with ```getStream()``` then the deferred must 
implement the notify() method.

### exec(sql, parameters)

Run a query and return a promise. Resolves to an object with keys for rows and 
fields. You can optionally 
[pass parameters](https://github.com/felixge/node-mysql#escaping-query-values) 
to the query.

For example:

    db.exec('SELECT * FROM t WHERE c = ?', [c])
        .then(function (result) {
            // ...
        });

This will return all results at once and should only be used when reasonably
small result sets are expected.

### getOneRow(sql, parameters)

This runs a query with exec but the promise it returns resolves to an array
containing the single array of values for the first row of the result. It
should only be used when only one row is expected, for example when selecting
a row by primary key.

    db.getOneRow('SELECT * FROM t WHERE id = ?', [id])
        .then(function (row) {
            // ...
        });

### getOneValue(sql, parameters)

This runs a query with exec but the promise it returns resolves to a single
value. It is useful when running a count(*) query for example.

    db.getOneValue('SELECT count(*) FROM t')
        .then(function (row) {
            // ...
        });

### set(table, identity, data)

This takes a table name, row identity information, and updated column data
and generates and runs an update statement. It returns a promise which
resolves when the update completes, or rejects with an error.

This is useful for easily updating rows.

    db.set('t', { id: 1 }, { c: 'foo' })
        .then(function () {
            // ...
        });

When building REST style services, this should help with PUT requests.

### get(table, identity)

Gets a single row from table with the column data in identity.

    db.get('t', { id: 1 })
        .then(function (row) {
            // ...
        });
        
When building REST style services, this should help with GET requests for
single entities.

### add(table, data)

Just like set for adding new rows. It's promise resolves to an exec promise
which resolves to an object which includes an insertId value.

    db.add('t', {
        c: 'foo'
    });
    
When building REST style services, this should help with POST requests.
    
### delete(table, identity)

This takes a table and row identity and deletes any matching rows. Its
promise resolves to an object which includes affectedRows with a deleted
row count.

    db.delete('t', {
        id: 1
    });

When building REST style services, this should help with DELETE requests.

### getStream(sql, parameters)

Returns a promise which reports rows as progress, and then finally resolves to 
the field definition data.

    db.getStream("SELECT * FROM t WHERE c=?", { c: 'foo' })
        .progress(function (row) {
            // do something with row
        })
        .then(function (fields) {
            // do something with the field data, or just stop expecting
            // more rows in progress().
        })
        .catch(function (error) {
            // Report error
        })
        .done();
        
Note that it is not possible to
[cancel a query in progress](https://github.com/felixge/node-mysql/issues/137).
        
### addLogger(f)

Will call f() with a single parameter which is a message to be logged. You
can add as many loggers as you like. For quick debugging you can add 
console.log. If you want to store a log file you might want to consider
something like [winston](https://github.com/flatiron/winston).

All messages logged by MyOath will begin with "MyOath: ".
