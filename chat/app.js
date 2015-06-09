
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path');

var app = express();

// all environments
app.set('port', /*process.env.PORT || */8888);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

var users = {};

app.get('/', function (req, res) {
  if (req.cookies.user == null) {
    res.redirect('/signin');
  } else {
    res.sendfile('views/index.html');
  }
});

app.get('/signin', function (req, res) {
  res.sendfile('views/signin.html');
});

app.post('/signin', function (req, res) {
  if (users[req.body.name]) {
    res.redirect('/signin');
  } else {
    res.cookie("user", req.body.name, {maxAge: 1000*60*60*24*30});
    res.redirect('/');
  }
});

var server = http.createServer(app);
var io = require('socket.io').listen(server);

io.sockets.on('connection', function (socket) {

  socket.on('online', function (data) {
    socket.name = data.user;
    if (!users[data.user]) {
      users[data.user] = data.user;
    }
    io.sockets.emit('online', {users: users, user: data.user});
  });

  socket.on('say', function (data) {
    if (data.to == 'all') {
      socket.broadcast.emit('say', data);
    } else {
      var clients = io.sockets.clients();
      clients.forEach(function (client) {
        if (client.name == data.to) {
          client.emit('say', data);
        }
      });
    }
  });

  socket.on('disconnect', function() {
    if (users[socket.name]) {
      delete users[socket.name];
      socket.broadcast.emit('offline', {users: users, user: socket.name});
    }
  });
});

server.listen(app.get('port'), function(){
  // console.log('Express server listening on port ' + app.get('port'));
});
