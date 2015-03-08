var DB = require('..');
require('should');

function testWithPromises(promises, name) {
    /**
     * You may need to change these to make the tests work. Tests require a live
     * MySQL server database / connection.  All tests use a table called myoath_t
     * so it shouldn't conflict with existing table names.
     */
    var mySQLConfig = {
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'myoath',
            promises: promises
        },
        db = new DB.MyOath(mySQLConfig);

    //db.addLogger(console.log);

    describe("MyOath with " + name, function () {
        var d = promises.defer ? promises.defer() : promises.deferred(),
            canNotify = !!d.notify;
        beforeEach(function (done) {
            db.exec("DROP TABLE IF EXISTS myoath_t")
                .then(function () {
                    return db.exec("CREATE TABLE myoath_t (id serial, c varchar(7))");
                })
                .then(function () {
                    return db.exec("INSERT INTO myoath_t (c) VALUES ('foo'),('bar'),('baz')");
                })
                .then(function () {
                    done();
                })
                .done();
        });
        it("runs SQL with parameters", function (done) {
            db.exec("SELECT * FROM myoath_t WHERE c=?", ['foo'])
                .then(function (result) {
                    result.rows.length.should.equal(1);
                    done();
                })
                .done();
        });
        it("barfs on bad SQL", function (done) {
            var resolution;
            db.exec("this is not SQL")
                .then(function (result) {
                    resolution = 'resolved';
                })
                .catch(function (error) {
                    resolution = 'rejected';
                })
                .done(function () {
                    resolution.should.equal('rejected');
                    done();
                });
        });
        it("fetches single rows", function (done) {
            db.getOneRow("SELECT * FROM myoath_t WHERE c=?", ['foo'])
                .then(function (row) {
                    row.should.have.keys('id', 'c');
                    row.id.should.equal(1);
                    row.c.should.equal('foo');
                    done();
                })
                .done();
        });
        it("fetches single values", function (done) {
            db.getOneValue("SELECT COUNT(*) FROM myoath_t")
                .then(function (c) {
                    c.should.equal(3);
                    done();
                })
                .done();
        });
        it("barfs when it needs a single value but doesn't get one", function (done) {
            var resolution;
            db.getOneValue("SELECT id FROM myoath_t WHERE c='bogus'")
                .then(function (result) {
                    resolution = 'resolved';
                })
                .catch(function (error) {
                    resolution = 'rejected';
                })
                .done(function () {
                    resolution.should.equal('rejected');
                    done();
                });
        });
        it("logs stuff when it has a loggers, and it can remove loggers", function (done) {
            var log = [],
                count;

            function logger(m) {
                log.push(m);
            }

            db.addLogger(logger);
            db.exec("SELECT COUNT(*) FROM myoath_t")
                .then(function () {
                    log.length.should.be.greaterThan(0);
                    count = log.length;
                    db.removeLogger(logger);
                    db.exec("SELECT COUNT(*) FROM myoath_t")
                        .then(function () {
                            log.length.should.equal(count);
                            done();
                        })
                        .done();
                })
                .done();
        });
        if (canNotify) {
            it("can fetch one record at a time", function (done) {
                var idNumber = 0,
                    expectedValues = {
                        1: 'foo',
                        2: 'bar',
                        3: 'baz'
                    };
                db.getStream("SELECT * FROM myoath_t ORDER BY id")
                    .progress(function (row) {
                        idNumber += 1;
                        row.c.should.equal(expectedValues[idNumber]);
                    })
                    .done(function () {
                        idNumber.should.equal(3);
                        done();
                    });
            });
        } else {
            it("can't fetch one record at a time without notify feature", function (done) {
                db.getStream("SELECT * FROM myoath_t ORDER BY id")
                    .catch(function (err) {
                            err.should.be.truthy;
                    })
                    .done(function () {
                        done();
                    });
            });
        }
        it("can add and get rows with shorthand", function (done) {
            var columnData = {c: 'bobo'};
            db.add('myoath_t', columnData)
                .then(function () {
                    db.get('myoath_t', columnData)
                        .then(function (row) {
                            row.id.should.equal(4);
                            row.c.should.equal(columnData.c);
                            done();
                        })
                        .done();
                })
                .done();
        });
        it("can set column values with shorthand", function (done) {
            var columnData = {c: 'bazinga'};
            db.set('myoath_t', {c: 'baz'}, columnData)
                .then(function () {
                    db.get('myoath_t', columnData)
                        .then(function (row) {
                            row.id.should.equal(3);
                            done();
                        })
                        .done();
                })
                .done();
        });
        it("can delete rows with shorthand", function (done) {
            db.delete('myoath_t', {c: 'bar'})
                .then(function () {
                    db.getOneValue("SELECT COUNT(*) FROM myoath_t")
                        .then(function (count) {
                            count.should.equal(2);
                            done();
                        })
                        .done();
                })
                .done();
        });
        it("can close the connection pool", function (done) {
            db.exec("select * from myoath_t")
                .then(function () {
                    db.end()
                        .then(function () {
                            var error = false;
                            db.exec("select * from myoath_t").then(
                                function (result) {},
                                function () {
                                    error = true;
                                }
                            ).done(
                                function () {
                                    error.should.be.true;
                                    done();
                                }
                            );
                        })
                        .done();
                })
                .done();
        });
    });
}

testWithPromises(require('q'), "Q");
testWithPromises(require('pimp'), "Pimp");
testWithPromises(require('bluebird'), "Bluebird");
testWithPromises(require('rsvp'), "RSVP");
testWithPromises(require('when'), "When");
