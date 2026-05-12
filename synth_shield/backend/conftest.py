import sys
import os

# Ensure backend/ is on sys.path so test files can import services, routers, etc.
sys.path.insert(0, os.path.dirname(__file__))
