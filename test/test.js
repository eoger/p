(function(){
"use strict";

if ( typeof P === "undefined" ) {
	global.P = require("../p");
	global.expect = require("expect.js");
	require("mocha");
}

var isNodeJS = typeof process === "object" && process &&
	({}).toString.call(process) === "[object process]";


function fail() {
	expect(true).to.be(false);
}


var VALUES = ["", true, false, 0, 1, 2, -1, -2, {}, [], {x: 1}, [1,2,3], null, void 0, new Error()];
VALUES[ VALUES.length + 1 ] = "sparse";
VALUES.length++;

function map( array, f ) {
	var array2 = new Array(array.length|0);
	for ( var i = 0, l = array.length; i < l; ++i ) {
		if ( i in array ) {
			array2[i] = f( array[i], i, array );
		}
	}
	return array2;
}

function allValues( func ) {
	return P.all( map(VALUES, func) );
}

describe("P function", function() {

	it("should return a promise", function() {
		map(VALUES, function( value ) {
			expect( P(value).constructor.name ).to.be("Promise");
		});
	});

	it("should return input itself if it is a promise", function() {
		var p = P();
		expect( P(p) ).to.be( p );
	});

	it("should fulfill with input if not a promise", function() {
		return allValues(function( value ) {
			return P( value ).then(function( fulfilledValue ) {
				expect( fulfilledValue ).to.be( value );
			});
		});
	});
});

describe("inspect", function() {

	it("on fulfillment", function() {
		return allValues(function( value ) {
			var p = P( value );
			return p.then(function() {
				expect( p.inspect() ).to.be.eql( {state: "fulfilled", value: value} );
			});
		});
	});

	it("on rejection", function() {
		return allValues(function( reason ) {
			var d = P.defer();
			var p = d.promise;
			expect( p.inspect() ).to.be.eql( {state: "pending"} );
			d.reject( reason );
			return p.then( fail, function() {
				expect( p.inspect() ).to.be.eql( {state: "rejected", reason: reason} );
			});
		});
	});
});

describe("reject", function() {

	it("returns a rejected promise", function() {
		return allValues(function( reason ) {
			return P.reject( reason ).then( fail, function( rejectedReason ) {
				expect( rejectedReason ).to.be( reason );
			});
		});
	});
});

describe("all", function() {

	it("resolves when passed an empty array", function() {
		return P.all([]);
	});

	it("resolves when passed an sparse array", function() {
		var toResolve = P.defer();
		var array = VALUES.concat( toResolve.promise );
		var array2 = array.slice();
		array2[ array2.length - 1 ] = 12;
		var promise = P.all( array );

		toResolve.resolve(12);

		return promise.then(function( values ) {
			expect( values ).to.be.eql( array2 );
		});
	});

	it("rejects if any consituent promise is rejectd", function() {
		var toReject = P.defer();
		var theReason = new Error();
		toReject.reject( theReason );
		var array = VALUES.concat( toReject.promise )

		return P.all( array )
		.then( fail, function( reason ) {
			expect( reason ).to.be( theReason );
		})
		.then(function() {
			var toRejectLater = P.defer();
			var array = VALUES.concat( toRejectLater.promise );
			var promise = P.all( array );
			toRejectLater.reject( theReason );
			return promise;
		})
		.then( fail, function( reason ) {
			expect( reason ).to.be( theReason );
		});
	});
});

describe("spread", function() {

	it("spreads values across arguments", function() {
		return P([1, P(2), 3]).spread(function( one, two, three ) {
			expect( one ).to.be( 1 );
			expect( two ).to.be( 2 );
			expect( three ).to.be( 3 );
		});
	});

	it("should call the errback in case of a rejected promise", function() {
		var toReject = P.defer();
		var theReason = new Error();
		toReject.reject( theReason );

		return P([ 1, P(2), toReject.promise]).spread(
			fail,
			function( reason ) {
				expect( reason ).to.be( theReason );
			}
		);
	});
});

describe("done", function() {

	afterEach(function() {
		P.onerror = null;
	});

	// TODO: cover other cases too!

	describe("when the promise is rejected", function() {
		describe("and there is no errback", function() {

			it("should throw the reason in a next turn", function( done ) {
				var turn = 0;
				var toReject = P.defer();
				toReject.reject("foo");
				var promise = toReject.promise;

				expect( promise.done() ).to.be( undefined );

				P.onerror = function( error ) {
					expect( turn ).to.be( 1 );
					expect( error ).to.be("foo");
					done();
				};

				++turn;
			});

		});
	});
});

describe("timeout", function() {

	// This part is based on the respective part of the Q spec.

	it("should do nothing if the promise fulfills quickly", function() {
		return P().delay( 10 ).timeout( 100 );
	});

	it("should do nothing if the promise rejects quickly", function() {
		var error = new Error();

		return P().delay( 10 )
		.then(function() {
			throw error;
		})
		.timeout( 100 )
		.then( fail, function( reason ) {
			expect( reason ).to.be( error );
		});
	});

	it("should reject within a timeout error if the promise is too slow", function() {
		return P().delay( 100 )
		.timeout( 10 )
		.then( fail, function( reason ) {
			expect( reason.message ).to.match(/time/i);
		});
	});

	it("should reject with a custom timeout message if the promise is too slow", function() {
		return P().delay( 100 )
		.timeout(10, "custom")
		.then( fail, function( reason ) {
			expect( reason.message ).to.match(/custom/i);
		});
	});
});

describe("delay", function() {

	// This part is based on the respective part of the Q spec.

	it("should dealy fulfillment", function() {
		var promise = P(1).delay( 50 );

		setTimeout(function() {
			expect( promise.inspect().state ).to.be("pending");
		}, 40);

		return promise;
	});

	it("should not dealy rejection", function() {
		var d = P.defer();
		d.reject(1);
		var promise = d.promise.delay( 50 );

		setTimeout(function() {
			expect( promise.inspect().state ).to.be("rejected");
		}, 40);

		return promise.then( fail, function(){} );
	});

	it("should delay after fulfillment", function() {
		var p1 = P("foo").delay( 30 );
		var p2 = p1.delay( 30 );

		setTimeout(function() {
			expect( p1.inspect().state ).to.be("fulfilled");
			expect( p2.inspect().state ).to.be("pending");
		}, 45);

		return p2.then(function( value ) {
			expect( value ).to.be("foo");
		});
	});
});

describe("nodeify", function() {

	it("calls back with a resolution", function( done ) {
		P( 7 ).nodeify(function( error, value ) {
			expect( error ).to.be( null );
			expect( value ).to.be( 7 );
			done();
		});
	});

	it("calls back with an error", function( done ) {
		P.reject( 13 ).nodeify(function( error, value ) {
			expect( error ).to.be( 13 );
			expect( value ).to.be( void 0 );
			done();
		});
	});

	it("forwards a fullfilment", function() {
		return P( 5 ).nodeify( void 0 ).then(function( value ) {
			expect( value ).to.be( 5 );
		});
	});

	it("forwards a rejection", function() {
		return P.reject( 3 ).nodeify( void 0 ).then(fail, function( reason ) {
			expect( reason ).to.be( 3 );
		});
	});
});

describe("promised", function() {

	var sum = P.promised(function( a, b ) {
		return a + b;
	});

	var inc = P.promised(function( n ) {
		return this + n;
	});

	it("resolves promised arguments", function() {
		return sum( P(1), 2 ).then(function( res ) {
			expect( res ).to.be( 3 );
		});
	});

	it("resolves promised `this`", function() {
		return inc.call( P(4), 1 ).then(function( res ) {
			expect( res ).to.be( 5 );
		});
	});

	it("is rejected if an argument is rejected", function() {
		return sum( P.reject(1), 2 ).then(fail, function( e ) {
			expect( e ).to.be( 1 );
		});
	});

	it("is rejected if `this` is rejected", function() {
		return inc.call( P.reject(1), P(2) ).then(fail, function( e ) {
			expect( e ).to.be( 1 );
		});
	});

});

if ( isNodeJS && !/v0\.8\./.test(process.version) ) describe("domain", function() {

	var domain = require("domain");

	it("should work with domains", function() {
		var d = P.defer();
		var theValue = 0;
		var theError = new Error();

		P(47).then(function( value ) { theValue = value; });

		var theDomain = domain.create();
		theDomain.on("error", function( error ) {
			expect( theValue ).to.be( 47 );
			expect( error ).to.be( theError );
			P().then( d.resolve );
		})
		.run(function() {
			P().then(function() {
				expect( domain.active ).to.be( theDomain );
			}).done();

			P.reject( theError ).done();
		});

		return d.promise.then(function() {
			expect( domain.active ).not.to.be( theDomain );
		}, fail);
	});

	it("should not evaluate promises in disposed domains", function() {
		var theDomain = domain.create();
		var called = false;

		theDomain.on("error", function( e ) {
			P().then(function() { called = true; });
			theDomain.dispose();
		})
		.run(function() {
			P.reject( new Error() ).done();
		});

		return P().delay(10).then(function() {
			expect( called ).to.be( false );
		});
	});
});

})();
