import unittest

from application import app


def iter_page_rules(flask_app):
    for rule in flask_app.url_map.iter_rules():
        if rule.endpoint == "static":
            continue
        if rule.arguments:
            continue
        methods = rule.methods or set()
        if "GET" not in methods:
            continue
        yield rule.rule


class PageLoadTests(unittest.TestCase):
    def test_every_page_loads_without_server_error(self):
        client = app.test_client()

        for route in iter_page_rules(app):
            with self.subTest(route=route):
                response = client.get(route)
                self.assertLess(response.status_code, 500)


if __name__ == "__main__":
    unittest.main()
