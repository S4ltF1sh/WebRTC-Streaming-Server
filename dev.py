"""
Development runner with no cache
"""
import sys

# Disable Python bytecode caching
sys.dont_write_bytecode = True

from server.main import run

if __name__ == '__main__':
    run()
