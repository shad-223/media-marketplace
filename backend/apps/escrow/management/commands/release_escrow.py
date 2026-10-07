from django.core.management.base import BaseCommand

from apps.escrow.services import release_due_orders


class Command(BaseCommand):
    help = "Release escrow for orders whose buyer-protection window has ended (run from cron)."

    def handle(self, *args, **opts):
        self.stdout.write(f"released {release_due_orders()} order(s)")
