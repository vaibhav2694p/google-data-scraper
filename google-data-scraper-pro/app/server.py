"""Flask application factory."""
from flask import Flask, jsonify, request
from flask_cors import CORS

from app.config import Config


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder="../web/templates",
        static_folder="../web/static",
    )
    app.config.from_object(Config)

    CORS(app, resources={r"/api/*": {"origins": "*"}})

    from app.routes import bp as api_bp
    app.register_blueprint(api_bp)

    @app.after_request
    def add_headers(response):
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response

    return app
