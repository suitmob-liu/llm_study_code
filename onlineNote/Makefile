CXX = g++
CC = gcc
CXXFLAGS = -std=c++17 -O2 -Wall
LDFLAGS = -lpthread -ldl

all: server manage_users

deps/.ready:
	bash setup.sh
	@touch $@

deps/sqlite3.o: deps/.ready
	$(CC) -O2 -DSQLITE_THREADSAFE=1 -c deps/sqlite3.c -o $@

server: src/main.cpp src/sha256.h deps/.ready deps/sqlite3.o
	$(CXX) $(CXXFLAGS) -Ideps -Isrc -o $@ src/main.cpp deps/sqlite3.o $(LDFLAGS)

manage_users: src/manage_users.cpp src/sha256.h deps/.ready deps/sqlite3.o
	$(CXX) $(CXXFLAGS) -Ideps -Isrc -o $@ src/manage_users.cpp deps/sqlite3.o $(LDFLAGS)

clean:
	rm -f server manage_users deps/sqlite3.o

.PHONY: all clean
