class MissingColumnsError(Exception):
    def __init__(self, exchange, missing, available):
        self.exchange = exchange
        self.missing = missing
        self.available = available
        super().__init__(f"Missing columns for {exchange}: {missing}")
