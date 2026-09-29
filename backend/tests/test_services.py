from app.services import analyze

def test_analysis_without_history_is_cautious():
    result=analyze("payments timing out",[])
    assert result["confidence"] < .2
    assert "Unknown" in result["root_cause"]
    assert result["next_actions"]

def test_analysis_warns_about_failed_fix():
    result=analyze("database errors",[{"id":4,"title":"DB outage","similarity":.8,"root_cause":"pool leak","resolution":"close sessions","failed_attempts":["increase pool without fixing leak"]}])
    assert any("Avoid repeating failed attempt" in item for item in result["next_actions"])
