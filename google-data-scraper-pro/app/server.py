"""Flask application factory."""
from flask import Flask

from app.config import Config


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder="../web/templates",
        static_folder="../web/static",
    )
    app.config.from_object(Config)

    from app.routes import bp as api_bp
    app.register_blueprint(api_bp)

    return app
